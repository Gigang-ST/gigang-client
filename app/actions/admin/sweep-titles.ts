"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { sweepEvaluateAndGrant } from "@/lib/titles/engine";

/**
 * 관리자 전체 재계산 — **부여만 한다. 회수하지 않는다.**
 *
 * 예전엔 `revoked`를 함께 돌려주고 화면에 "자동 회수 N개"를 찍었는데, 엔진에 회수 코드가
 * 처음부터 없어 **늘 0이었다** — 없는 기능이 정상 동작하는 것처럼 보였다. 회수는 관리자
 * 수동(`revokeTitle`)이 유일한 경로다(설계 §6.4와 같은 태도).
 */
export async function sweepAllTitles(): Promise<{
  ok: boolean;
  message: string | null;
  granted?: number;
}> {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: members, error } = await db
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "active");

    if (error) return { ok: false, message: "멤버 조회에 실패했습니다.", granted: 0 };
    if (!members || members.length === 0) return { ok: true, message: "활성 멤버가 없습니다.", granted: 0 };

    const { granted } = await sweepEvaluateAndGrant(teamId, members.map((m) => m.team_mem_id));

    return {
      ok: true,
      message: `${members.length}명 평가 완료. 신규 부여 ${granted}개.`,
      granted,
    };
  });
}
