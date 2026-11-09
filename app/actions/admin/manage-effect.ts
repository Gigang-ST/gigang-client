"use server";

import { withAdmin } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

/**
 * 이펙트 설정(등급·사용 여부·해금 조건)은 **팀별**이다 — `team_effect_cfg`(팀, 이펙트)에 쓴다.
 * 예전엔 공용 `effect_mst` 를 직접 고쳐서, 한 팀 관리자가 바꾸면 모든 팀이 바뀌었다.
 * 이펙트 목록(`effect_mst`)은 이제 손대지 않는다 — 팀 행이 없는 팀의 기본값이다.
 */

type EffectPatch = { rarity_level?: number; use_yn?: boolean; unlock_cond_json?: UnlockCond };

/** 이 팀의 지금 값(팀 행 → 없으면 공용 기본값)에 바꿀 값만 얹어 팀 행으로 저장 */
async function saveTeamEffect(
  effectCd: string,
  patch: EffectPatch,
  actorMemId: string | null,
): Promise<{ ok: false; message: string } | { ok: true; message: null }> {
  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();
  const [{ data: base }, { data: current }] = await Promise.all([
    db.from("effect_mst").select("rarity_level, use_yn, unlock_cond_json").eq("effect_cd", effectCd).maybeSingle(),
    db
      .from("team_effect_cfg")
      .select("rarity_level, use_yn, unlock_cond_json")
      .eq("team_id", teamId)
      .eq("effect_cd", effectCd)
      .maybeSingle(),
  ]);
  if (!base) return { ok: false, message: "이펙트를 찾을 수 없습니다" };
  const now = current ?? base;
  const { error } = await db.from("team_effect_cfg").upsert(
    {
      team_id: teamId,
      effect_cd: effectCd,
      rarity_level: patch.rarity_level ?? now.rarity_level,
      use_yn: patch.use_yn ?? now.use_yn,
      unlock_cond_json: (patch.unlock_cond_json !== undefined ? patch.unlock_cond_json : now.unlock_cond_json) as Json,
      upd_at: dayjs().toISOString(),
      upd_by: actorMemId,
    },
    { onConflict: "team_id,effect_cd" },
  );
  if (error) return { ok: false, message: "저장에 실패했습니다" };
  return { ok: true, message: null };
}

export async function updateEffectLevel(effectCd: string, rarityLevel: number) {
  return withAdmin(async ({ member }) => {
    if (rarityLevel < 1 || rarityLevel > 10) return { ok: false, message: "등급은 1~10 사이여야 합니다" };
    return saveTeamEffect(effectCd, { rarity_level: rarityLevel }, member.id ?? null);
  });
}

export type UnlockCond =
  | { type: "rarity"; level: number }
  | { type: "title"; ttl_nm: string }
  | { type: "point"; amount: number }
  | null;

export async function updateEffectUnlockCond(effectCd: string, cond: UnlockCond) {
  return withAdmin(async ({ member }) => {
    if (cond?.type === "rarity" && (cond.level < 1 || cond.level > 10)) {
      return { ok: false, message: "등급은 1~10 사이여야 합니다" };
    }
    return saveTeamEffect(effectCd, { unlock_cond_json: cond }, member.id ?? null);
  });
}

export async function toggleEffectUseYn(effectCd: string, useYn: boolean) {
  return withAdmin(async ({ member }) => {
    return saveTeamEffect(effectCd, { use_yn: useYn }, member.id ?? null);
  });
}
