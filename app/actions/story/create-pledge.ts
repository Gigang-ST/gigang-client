"use server";

import { revalidateTag } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createPledgeSchema } from "@/lib/validations/pledge";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreatePledgeResult =
  | { ok: false; message: string }
  | { ok: true; pldg_id: string };

/**
 * 각오(한 줄 다짐) 작성 — 만료 없이 계속 쌓인다. 로그인한 활동 멤버 누구나 작성 가능, 40자 제한.
 *
 * `withActive`가 로그인 + `mem_st_cd = 'active'`를 강제한다(RLS의 `v2_rls_auth_in_team`은
 * 팀 소속만 검사하고 활동 여부는 안 본다 — `pldg_mst` RLS insert 정책과 동일 경계).
 *
 * 목록은 "최근순 무제한 누적"이라 페이지네이션 무효화 지점이 없다 — 작성 즉시 `story-feed`
 * 태그 하나만 revalidate하면 전광판 pledges 존이 갱신된다. `bumpStoryReaction`과 달리 여기는
 * 연타가 없는 저빈도 쓰기라 매 작성마다 무효화해도 캐시가 남아나지 않는다(응원과의 결정적 차이).
 */
export async function createPledge(input: { pldg_txt: string }): Promise<CreatePledgeResult> {
  const parsed = createPledgeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "잘못된 요청입니다" };
  }

  try {
    return await withActive(async ({ member }) => {
      const { teamId } = await getRequestTeamContext();
      const admin = createAdminClient();

      const { data, error } = await admin
        .from("pldg_mst")
        .insert({
          team_id: teamId,
          mem_id: member.id,
          pldg_txt: parsed.data.pldg_txt,
        })
        .select("pldg_id")
        .single();

      if (error || !data) {
        console.error("[createPledge] 저장 실패", error);
        return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
      }

      revalidateTag("story-feed", "max");
      return { ok: true as const, pldg_id: data.pldg_id };
    });
  } catch (e) {
    // withActive는 비로그인·비활성일 때 throw한다. bumpStoryReaction과 동일하게 결과값으로 변환.
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
