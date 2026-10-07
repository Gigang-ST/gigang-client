// lib/pb-class-seed.ts — PB 클래스 기본 훈련표 자동 채우기 (클라이언트 주입식 — next/* 없음)
//
// 오너 지시(2026-10-07): "활성화하면 알아서 들어가게 해 줘. 어차피 기본 훈련표로 시작할 거야,
// 하다가 일정상 어려운 게 있으면 수정하는 거지." — 그래서 관리자가 버튼을 누르지 않아도 프로젝트를
// **진행중으로 여는 순간** 훈련표가 비어 있으면 기본값(`PB_DEFAULT_SESS_PLANS`)을 넣는다.
// 이미 한 줄이라도 있으면 손대지 않는다(운영진이 고친 내용을 덮지 않게).
//
// 관리자 「기본 훈련표 불러오기」 버튼·상태 변경·프로젝트 생성/수정이 전부 이 함수 하나를 부른다.

import type { SupabaseClient } from "@supabase/supabase-js";

import { PB_CLASS_TYPE } from "@/lib/pb-class";
import { PB_DEFAULT_SESS_PLANS } from "@/lib/pb-class-plan";
import { cfgFromRow } from "@/lib/queries/pb-class";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

/**
 * - `seeded`: 기본 훈련표를 넣었다
 * - `exists`: 이미 훈련표가 있다(동시에 눌러 PK가 겹친 경우 포함)
 * - `not_pb`: PB 클래스가 아니다
 * - `cfg_mismatch`: 총 회차가 기본 훈련표(13회차)와 달라 몇 번째가 측정인지 어긋난다 — 직접 입력해야 한다
 */
export type PbSeedResult = "seeded" | "exists" | "not_pb" | "cfg_mismatch";

/** 훈련표가 비어 있으면 기본 훈련표를 넣는다. 조회·쓰기 실패는 던진다 */
export async function ensureDefaultSessPlans(db: Db, evtId: string): Promise<PbSeedResult> {
  const { data: evt, error: evtError } = await db
    .from("evt_team_mst")
    .select("evt_type_cd")
    .eq("evt_id", evtId)
    .maybeSingle();
  if (evtError) throw new Error(`ensureDefaultSessPlans 이벤트 조회 실패: ${evtError.message}`);
  if (!evt || evt.evt_type_cd !== PB_CLASS_TYPE) return "not_pb";

  const { data: cfgRow, error: cfgError } = await db
    .from("evt_pb_cfg")
    .select("*")
    .eq("evt_id", evtId)
    .maybeSingle();
  if (cfgError) throw new Error(`ensureDefaultSessPlans 설정 조회 실패: ${cfgError.message}`);
  if (cfgFromRow(cfgRow).totSessCnt !== PB_DEFAULT_SESS_PLANS.length) return "cfg_mismatch";

  const { count, error: countError } = await db
    .from("evt_pb_sess_plan")
    .select("sess_no", { count: "exact", head: true })
    .eq("evt_id", evtId);
  if (countError) throw new Error(`ensureDefaultSessPlans 훈련표 조회 실패: ${countError.message}`);
  if ((count ?? 0) > 0) return "exists";

  const { error } = await db.from("evt_pb_sess_plan").insert(
    PB_DEFAULT_SESS_PLANS.map((p) => ({
      evt_id: evtId,
      sess_no: p.sessNo,
      phase_nm: p.phaseNm,
      ttl: p.ttl,
      main_txt: p.mainTxt,
      easy_txt: p.easyTxt,
      purp_txt: p.purpTxt,
      note_txt: p.noteTxt,
    })),
  );
  if (error) {
    // 두 경로가 동시에 채우면(버튼 + 상태 변경) 뒤엣것이 PK에 걸린다 — 이미 채워졌다는 뜻이다
    if (error.code === "23505") return "exists";
    throw new Error(`ensureDefaultSessPlans 훈련표 저장 실패: ${error.message}`);
  }
  return "seeded";
}
