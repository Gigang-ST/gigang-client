import "server-only";

import { revalidateTag } from "next/cache";

import { listMemberTeams } from "@/lib/actions/team-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";

/**
 * 사람 단위 데이터(대회 기록·UTMB)를 바꾼 뒤 — 그 사람이 속한 **다른 팀들**에도 반영한다.
 *
 * 대회 기록·UTMB 는 사람 것이라(2026-11-09 결정) 두 팀 소속자의 기록은 두 팀 전당에 다 선다.
 * 저장한 쪽(접속한 팀)은 호출부가 기존대로 판정해 캐시를 털고 칭호를 평가하고,
 * 여기서는 **나머지 팀**의 랭킹 캐시(`records:{teamId}`)를 털고 칭호(race_record)를 평가한다.
 * 나머지 팀은 TOP10 판정 없이 턴다 — 기록 저장은 하루 몇 건이라 다시 계산해도 부담이 없다.
 *
 * 실패해도 던지지 않는다(저장은 이미 끝났다). 칭호 평가는 호출부가 `after()` 안에서 부르길 권한다.
 */
export async function syncPersonRecordToOtherTeams(
  memId: string,
  currentTeamId: string,
  opts: { evaluateTitles?: boolean } = {},
): Promise<void> {
  try {
    const teams = (await listMemberTeams(createAdminClient(), memId)).filter((t) => t.teamId !== currentTeamId);
    for (const t of teams) {
      revalidateTag(`records:${t.teamId}`, "max");
      // 칭호는 그 팀 **활동 회원**만 — 칭호 배치(lib/batch/jobs/titles.ts)와 같은 기준.
      // 비활성인 팀에서 다른 팀 기록으로 칭호가 붙으면 안 된다. 랭킹 캐시는 위에서 그대로 턴다.
      if (opts.evaluateTitles && t.active) {
        await evaluateAndGrantTitles({ trigger: "race_record", teamId: t.teamId, teamMemId: t.teamMemId }).catch((e) =>
          console.error("[title-engine] race_record(다른 팀) 평가 실패", t.teamId, e),
        );
      }
    }
  } catch (e) {
    console.error("[records] 다른 팀 반영 실패", memId, e);
  }
}

/** 여러 사람의 기록이 바뀐 경우(UTMB 일괄 갱신 등) — 그 사람들이 속한 모든 팀의 랭킹 캐시를 턴다 */
export async function revalidateRecordsForMembers(memIds: string[]): Promise<void> {
  if (memIds.length === 0) return;
  try {
    const { data } = await createAdminClient()
      .from("team_mem_rel")
      .select("team_id")
      .in("mem_id", memIds)
      .neq("mem_st_cd", "left")
      .eq("vers", 0)
      .eq("del_yn", false);
    for (const teamId of new Set((data ?? []).map((r) => r.team_id))) {
      revalidateTag(`records:${teamId}`, "max");
    }
  } catch (e) {
    console.error("[records] 캐시 무효화 실패", e);
  }
}
