import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * "이 대상이 접속한 팀 것인가" 판정 — 관리자 액션의 팀 경계.
 *
 * 서버 액션 대부분은 service_role(`createAdminClient`)로 써서 **RLS 를 건너뛴다.** 그래서 id 하나만
 * 받아 찾으면, 울산 관리자가 기강 회원·기강 칭호 id 를 넘겨 기강 데이터를 고칠 수 있다.
 * `withAdmin` 은 "접속한 팀의 관리자인가"만 보므로, 대상이 그 팀 것인지는 액션이 따로 확인해야 한다.
 *
 * 회원 상태(활동·비활성·탈퇴)는 보지 않는다 — 관리자는 탈퇴자의 칭호 회수·기록 정리도 한다.
 * 회귀 테스트: `app/actions/__tests__/admin-team-scope.test.ts`.
 */

type Db = SupabaseClient<Database>;

/** `team_mem_id` 가 이 팀의 현재 소속 행인가 */
export async function isTeamMemIdInTeam(db: Db, teamId: string, teamMemId: string): Promise<boolean> {
  const { data } = await db
    .from("team_mem_rel")
    .select("team_mem_id")
    .eq("team_mem_id", teamMemId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  return Boolean(data);
}

/** 프로젝트(마일리지런·PB 시즌, `evt_team_mst`)가 이 팀 것인가 — 배율·참가자·활동 기록은 이걸 따라 팀이 정해진다 */
export async function isEvtInTeam(db: Db, teamId: string, evtId: string): Promise<boolean> {
  const { data } = await db
    .from("evt_team_mst")
    .select("evt_id")
    .eq("evt_id", evtId)
    .eq("team_id", teamId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * 받은 `mem_id` 목록 중 이 팀 소속만 남긴다 — 멘션·관리자 알림 대상처럼 브라우저가 고른 사람 목록용.
 * 안 거르면 아무 mem_id 에나 이 팀 이름으로 알림·푸시가 간다.
 */
export async function filterMemIdsInTeam(db: Db, teamId: string, memIds: string[]): Promise<string[]> {
  if (memIds.length === 0) return [];
  const { data } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .in("mem_id", memIds)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  const inTeam = new Set((data ?? []).map((r) => r.mem_id));
  return memIds.filter((id) => inTeam.has(id));
}

/** 사람(`mem_id`)이 이 팀에 소속돼 있는가 — 사람 단위 데이터(기록 등)를 그 팀 관리자가 다룰 수 있는지 */
export async function isMemIdInTeam(db: Db, teamId: string, memId: string): Promise<boolean> {
  const { data } = await db
    .from("team_mem_rel")
    .select("team_mem_id")
    .eq("mem_id", memId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  return Boolean(data);
}
