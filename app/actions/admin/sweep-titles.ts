"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { sweepEvaluateAndGrant } from "@/lib/titles/engine";

export async function sweepAllTitles(): Promise<{
  ok: boolean;
  message: string | null;
  granted?: number;
  revoked?: number;
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

    if (error) return { ok: false, message: "멤버 조회에 실패했습니다.", granted: 0, revoked: 0 };
    if (!members || members.length === 0) return { ok: true, message: "활성 멤버가 없습니다.", granted: 0, revoked: 0 };

    const { granted, revoked } = await sweepEvaluateAndGrant(teamId, members.map((m) => m.team_mem_id));

    return {
      ok: true,
      message: `${members.length}명 평가 완료. 신규 부여 ${granted}개, 자동 회수 ${revoked}개.`,
      granted,
      revoked,
    };
  });
}
