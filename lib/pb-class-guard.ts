// lib/pb-class-guard.ts — PB 클래스 관리자 액션의 「요청 팀 소속인가」 판정
//
// PB 클래스 테이블엔 쓰기 RLS 정책이 없어 모든 쓰기가 service role 이다. RLS 백스톱이 없으므로 액션마다
// **대상이 요청 팀의 PB_CLASS 프로젝트에 속하는지** 직접 확인해야 한다 — 빼먹으면 관리자 한 명이 다른 팀
// (또는 마일리지런) 행을 id 추측만으로 건드린다. 1단계 액션(`manage-pb-class.ts`)과 2·3단계 액션
// (`manage-pb-class-game.ts`)이 **같은 판정**을 쓰도록 "use server" 파일 밖으로 뺐다
// ("use server" 파일은 async 함수만 export 할 수 있고, 두 파일이 서로의 비공개 함수를 못 본다).
//
// 존재 여부를 구분해 알려 주지 않는다 — 다른 팀·다른 종류·없는 id 는 전부 null.

import type { SupabaseClient } from "@supabase/supabase-js";

import { PB_CLASS_TYPE } from "@/lib/pb-class";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

export type PbEvtGuard = { evt_id: string; stt_dt: string; end_dt: string };

/** 요청 팀의 PB_CLASS 프로젝트만 돌려준다 */
export async function guardEvent(db: Db, evtId: string, teamId: string): Promise<PbEvtGuard | null> {
  const { data } = await db
    .from("evt_team_mst")
    .select("evt_id, stt_dt, end_dt")
    .eq("evt_id", evtId)
    .eq("team_id", teamId)
    .eq("evt_type_cd", PB_CLASS_TYPE)
    .maybeSingle();
  return data ?? null;
}

/** prt_id 로 지정되는 액션용 — 그 참가자가 요청 팀의 PB_CLASS 프로젝트 소속인지 한 번에 확인 */
export async function guardParticipant(
  db: Db,
  prtId: string,
  teamId: string,
): Promise<{ prt_id: string; evt_id: string } | null> {
  const { data } = await db
    .from("evt_pb_prt_rel")
    .select("prt_id, evt_id, evt_team_mst!inner(team_id, evt_type_cd)")
    .eq("prt_id", prtId)
    .eq("evt_team_mst.team_id", teamId)
    .eq("evt_team_mst.evt_type_cd", PB_CLASS_TYPE)
    .maybeSingle();
  return data ? { prt_id: data.prt_id, evt_id: data.evt_id } : null;
}

/** grp_id 로 지정되는 액션용 — 게임팀이 요청 팀의 PB_CLASS 프로젝트 소속인지 확인 */
export async function guardGroup(
  db: Db,
  grpId: string,
  teamId: string,
): Promise<{ grp_id: string; evt_id: string } | null> {
  const { data } = await db
    .from("evt_pb_grp_mst")
    .select("grp_id, evt_id, evt_team_mst!inner(team_id, evt_type_cd)")
    .eq("grp_id", grpId)
    .eq("evt_team_mst.team_id", teamId)
    .eq("evt_team_mst.evt_type_cd", PB_CLASS_TYPE)
    .maybeSingle();
  return data ? { grp_id: data.grp_id, evt_id: data.evt_id } : null;
}
