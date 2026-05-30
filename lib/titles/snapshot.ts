/**
 * 칭호 일괄 평가용 멤버 스냅샷
 *
 * sweepAllTitles() 에서 멤버 전체 데이터를 DB 쿼리 6번으로 한 번에 로드한다.
 * evaluators.ts 의 bulk 전용 함수들은 DB 대신 이 스냅샷을 받아 메모리 내에서 평가한다.
 *
 * 단건 트리거(race_record, attendance 등)는 스냅샷을 사용하지 않으므로 이 파일과 무관하다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// 스냅샷 타입
// ---------------------------------------------------------------------------

export type RaceHistRow = {
  mem_id: string;
  rec_time_sec: number;
  comp_evt_type: string;   // comp_evt_cfg.comp_evt_type (정규화 후)
  comp_sprt_cd: string;    // comp_mst.comp_sprt_cd (정규화 후)
  comp_date: string | null; // comp_mst.stt_dt (월범위/연도 조건용)
};

/** 마일리지런 월별 스냅샷 (mileage_* 조건용) */
export type MileageMthSnapRow = {
  base_dt: string;   // YYYY-MM-01
  achv_yn: boolean;
  achv_mlg: number;
  goal_mlg: number;
};

/** 마일리지런 활동 기록 (mileage_all_sports_in_month, mileage_sport_ratio 조건용) */
export type MileageActRow = {
  act_dt: string;    // YYYY-MM-DD
  sprt_enm: string;
  final_mlg: number;
};

/** 멤버 한 명의 평가에 필요한 데이터 */
export type MemberSnapshot = {
  teamMemId: string;
  memId: string;
  joinDt: string | null;
  gender: string;          // mem_mst.gdr_enm (race_rank_by_gender 조건용)
  raceHist: RaceHistRow[];
  utmbIdx: number | null;  // mem_utmb_prf.utmb_idx (utmb_idx_rank 조건용)
  heldTitleIds: Set<string>;
  /** 보유 칭호 ID → { ttl_nm, ttl_ctgr_cd } 맵 (race_finish_all_titles, has_title_in_categories 조건용) */
  heldTitleMeta: Map<string, { ttl_nm: string; ttl_ctgr_cd: string }>;
  /** 마일리지런 참가 여부 (mileage_joined 조건용) */
  mileageParticipant: boolean;
  /** 마일리지런 월별 목표/달성 스냅샷 (mileage_goal_* 조건용) */
  mileageMthSnaps: MileageMthSnapRow[];
  /** 마일리지런 활동 기록 (mileage_all_sports_in_month, mileage_sport_ratio 조건용) */
  mileageActHist: MileageActRow[];
  /** 이벤트 end_dt (mileage_rocket_in_months 조건용) */
  mileageEvtEndDt: string | null;
};

export type HeldTitleRow = {
  mem_ttl_id: string;
  ttl_id: string;
  vers: number;
};

export type MemberSnapshotWithHeld = MemberSnapshot & {
  heldRows: HeldTitleRow[];
};

// ---------------------------------------------------------------------------
// bulk 로더
// ---------------------------------------------------------------------------

/**
 * 팀 전체 활성 멤버의 평가 데이터를 DB 쿼리 6번으로 한 번에 로드한다.
 *
 * @returns teamMemId → MemberSnapshotWithHeld 맵
 */
export async function loadMemberSnapshots(
  db: DB,
  teamId: string,
  teamMemIds: string[],
): Promise<Map<string, MemberSnapshotWithHeld>> {
  if (teamMemIds.length === 0) return new Map();

  // 1. team_mem_rel: team_mem_id → mem_id, join_dt 한 번에
  const { data: relRows } = await db
    .from("team_mem_rel")
    .select("team_mem_id, mem_id, join_dt")
    .eq("team_id", teamId)
    .in("team_mem_id", teamMemIds)
    .eq("vers", 0)
    .eq("del_yn", false);

  const relMap = new Map<string, { memId: string; joinDt: string | null }>();
  for (const r of relRows ?? []) {
    relMap.set(r.team_mem_id, { memId: r.mem_id, joinDt: r.join_dt ?? null });
  }

  const memIds = [...new Set([...relMap.values()].map((r) => r.memId))];
  if (memIds.length === 0) return new Map();

  // 2. mem_mst: 성별 한 번에 (race_rank_by_gender 조건용)
  const { data: memRows } = await db
    .from("mem_mst")
    .select("mem_id, gdr_enm")
    .in("mem_id", memIds);

  const genderMap = new Map<string, string>();
  for (const r of memRows ?? []) {
    genderMap.set(r.mem_id, r.gdr_enm ?? "");
  }

  // 3. rec_race_hist: 전체 멤버 기록 한 번에 (stt_dt 포함)
  const { data: histRows } = await db
    .from("rec_race_hist")
    .select("mem_id, rec_time_sec, comp_evt_cfg!inner(comp_evt_type), comp_mst!inner(comp_sprt_cd, stt_dt)")
    .in("mem_id", memIds)
    .eq("del_yn", false)
    .eq("vers", 0);

  const histMap = new Map<string, RaceHistRow[]>();
  for (const row of histRows ?? []) {
    const evtCfg = Array.isArray(row.comp_evt_cfg) ? row.comp_evt_cfg[0] : row.comp_evt_cfg;
    const mst = Array.isArray(row.comp_mst) ? row.comp_mst[0] : row.comp_mst;
    const evtType = (evtCfg as { comp_evt_type?: string } | null)?.comp_evt_type?.toUpperCase() ?? "";
    const sprtCd = (mst as { comp_sprt_cd?: string; stt_dt?: string } | null)?.comp_sprt_cd ?? "";
    const compDate = (mst as { comp_sprt_cd?: string; stt_dt?: string } | null)?.stt_dt ?? null;

    if (!histMap.has(row.mem_id)) histMap.set(row.mem_id, []);
    histMap.get(row.mem_id)!.push({
      mem_id: row.mem_id,
      rec_time_sec: row.rec_time_sec,
      comp_evt_type: evtType,
      comp_sprt_cd: sprtCd,
      comp_date: compDate,
    });
  }

  // 4. mem_utmb_prf: UTMB 인덱스 한 번에 (utmb_idx_rank 조건용)
  const { data: utmbRows } = await db
    .from("mem_utmb_prf")
    .select("mem_id, utmb_idx")
    .in("mem_id", memIds)
    .eq("vers", 0)
    .eq("del_yn", false);

  const utmbIdxMap = new Map<string, number>();
  for (const r of utmbRows ?? []) {
    utmbIdxMap.set(r.mem_id, r.utmb_idx);
  }

  // 5. mem_ttl_rel: 전체 멤버 보유 칭호 한 번에
  const { data: heldRows } = await db
    .from("mem_ttl_rel")
    .select("team_mem_id, mem_ttl_id, ttl_id, vers")
    .in("team_mem_id", teamMemIds)
    .eq("vers", 0)
    .eq("del_yn", false);

  const heldMap = new Map<string, HeldTitleRow[]>();
  for (const r of heldRows ?? []) {
    if (!heldMap.has(r.team_mem_id)) heldMap.set(r.team_mem_id, []);
    heldMap.get(r.team_mem_id)!.push({
      mem_ttl_id: r.mem_ttl_id,
      ttl_id: r.ttl_id,
      vers: r.vers,
    });
  }

  // 6. ttl_mst: 팀 칭호 메타 한 번에 (ttl_nm, ttl_ctgr_cd — race_finish_all_titles, has_title_in_categories 조건용)
  const allHeldTtlIds = [...new Set([...(heldRows ?? []).map((r) => r.ttl_id)])];
  const titleMetaMap = new Map<string, { ttl_nm: string; ttl_ctgr_cd: string }>();

  if (allHeldTtlIds.length > 0) {
    const { data: titleRows } = await db
      .from("ttl_mst")
      .select("ttl_id, ttl_nm, ttl_ctgr_cd")
      .in("ttl_id", allHeldTtlIds)
      .eq("vers", 0)
      .eq("del_yn", false);

    for (const r of titleRows ?? []) {
      titleMetaMap.set(r.ttl_id, { ttl_nm: r.ttl_nm, ttl_ctgr_cd: r.ttl_ctgr_cd });
    }
  }

  // 7. 마일리지런 데이터 로드 (mileage_* 조건용)
  // 7-1. 참여자 조회 (mem_id → prt_id, evt_id)
  const { data: prtRows } = await db
    .from("evt_team_prt_rel")
    .select("prt_id, mem_id, evt_id, evt_team_mst!inner(end_dt)")
    .in("mem_id", memIds)
    .eq("aprv_yn", true);

  const prtByMemId = new Map<string, { prtId: string; evtEndDt: string }>();
  const allPrtIds: string[] = [];
  for (const r of prtRows ?? []) {
    const evtMst = Array.isArray(r.evt_team_mst) ? r.evt_team_mst[0] : r.evt_team_mst;
    const endDt = (evtMst as { end_dt: string }).end_dt;
    prtByMemId.set(r.mem_id, { prtId: r.prt_id, evtEndDt: endDt });
    allPrtIds.push(r.prt_id);
  }

  // 7-2. 월별 목표/달성 스냅샷
  const mthSnapByPrtId = new Map<string, MileageMthSnapRow[]>();
  if (allPrtIds.length > 0) {
    const { data: mthRows } = await db
      .from("evt_mlg_mth_snap")
      .select("prt_id, base_dt, achv_yn, achv_mlg, goal_mlg")
      .in("prt_id", allPrtIds);

    for (const r of mthRows ?? []) {
      if (!mthSnapByPrtId.has(r.prt_id)) mthSnapByPrtId.set(r.prt_id, []);
      mthSnapByPrtId.get(r.prt_id)!.push({
        base_dt: r.base_dt as string,
        achv_yn: r.achv_yn ?? false,
        achv_mlg: Number(r.achv_mlg),
        goal_mlg: Number(r.goal_mlg),
      });
    }
  }

  // 7-3. 활동 기록
  const actHistByPrtId = new Map<string, MileageActRow[]>();
  if (allPrtIds.length > 0) {
    const { data: actRows } = await db
      .from("evt_mlg_act_hist")
      .select("prt_id, act_dt, sprt_enm, final_mlg")
      .in("prt_id", allPrtIds);

    for (const r of actRows ?? []) {
      if (!actHistByPrtId.has(r.prt_id)) actHistByPrtId.set(r.prt_id, []);
      actHistByPrtId.get(r.prt_id)!.push({
        act_dt: r.act_dt as string,
        sprt_enm: r.sprt_enm as string,
        final_mlg: Number(r.final_mlg),
      });
    }
  }

  // 8. 조합
  const result = new Map<string, MemberSnapshotWithHeld>();
  for (const teamMemId of teamMemIds) {
    const rel = relMap.get(teamMemId);
    if (!rel) continue;

    const held = heldMap.get(teamMemId) ?? [];
    const heldTitleMeta = new Map<string, { ttl_nm: string; ttl_ctgr_cd: string }>();
    for (const h of held) {
      const meta = titleMetaMap.get(h.ttl_id);
      if (meta) heldTitleMeta.set(h.ttl_id, meta);
    }

    const prtInfo = prtByMemId.get(rel.memId);
    const mthSnaps = prtInfo ? (mthSnapByPrtId.get(prtInfo.prtId) ?? []) : [];
    const actHist = prtInfo ? (actHistByPrtId.get(prtInfo.prtId) ?? []) : [];

    result.set(teamMemId, {
      teamMemId,
      memId: rel.memId,
      joinDt: rel.joinDt,
      gender: genderMap.get(rel.memId) ?? "",
      raceHist: histMap.get(rel.memId) ?? [],
      utmbIdx: utmbIdxMap.get(rel.memId) ?? null,
      heldTitleIds: new Set(held.map((h) => h.ttl_id)),
      heldTitleMeta,
      heldRows: held,
      mileageParticipant: prtInfo !== undefined,
      mileageMthSnaps: mthSnaps,
      mileageActHist: actHist,
      mileageEvtEndDt: prtInfo?.evtEndDt ?? null,
    });
  }

  return result;
}
