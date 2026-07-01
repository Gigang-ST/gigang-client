"use server";

import { dayjs } from "@/lib/dayjs";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

import { normalizePayerName } from "@/lib/dues/normalize-payer-name";

export type AliasLearnItem = { rawName: string; memId: string };

/**
 * 입금자명(정규화) → 회원 매핑을 `fee_payer_alias`에 학습시킨다.
 * 다음 업로드부터 같은 입금자명이 자동 매칭된다.
 *
 * upsert(onConflict) 대신 조회 후 update/insert로 구현한다: 유니크 인덱스가
 * `uk_fee_payer_alias_team_norm ON (team_id, raw_name_norm) WHERE del_yn = false`
 * 부분 인덱스라 Supabase가 생성하는 `ON CONFLICT (team_id, raw_name_norm)`(WHERE 절 없음)와
 * 매칭되지 않아 "no unique or exclusion constraint matching the ON CONFLICT specification" 에러가 난다.
 */
export async function learnAliases(items: AliasLearnItem[]) {
  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    // 정규화 이름으로 중복 제거 (같은 이름이 여러 번 오면 마지막 값 우선)
    const dedup = new Map<string, string>();
    for (const it of items) {
      const norm = normalizePayerName(it.rawName);
      if (!norm) continue;
      dedup.set(norm, it.memId);
    }

    if (dedup.size === 0) return { ok: true as const, message: null, learned: 0 };

    const now = dayjs().toISOString();
    let learned = 0;

    for (const [norm, memId] of dedup) {
      const { data: existing, error: selectError } = await db
        .from("fee_payer_alias")
        .select("alias_id")
        .eq("team_id", teamId)
        .eq("raw_name_norm", norm)
        .eq("del_yn", false)
        .maybeSingle();

      if (selectError) return { ok: false as const, message: "별칭 저장에 실패했습니다.", learned: 0 };

      if (existing) {
        const { error: updateError } = await db
          .from("fee_payer_alias")
          .update({ mem_id: memId, last_used_at: now })
          .eq("alias_id", existing.alias_id);
        if (updateError) return { ok: false as const, message: "별칭 저장에 실패했습니다.", learned: 0 };
      } else {
        const { error: insertError } = await db.from("fee_payer_alias").insert({
          team_id: teamId,
          raw_name_norm: norm,
          mem_id: memId,
          last_used_at: now,
          created_by: member.id,
          vers: 0,
          del_yn: false,
        });
        if (insertError) return { ok: false as const, message: "별칭 저장에 실패했습니다.", learned: 0 };
      }

      learned += 1;
    }

    return { ok: true as const, message: null, learned };
  });
}
