import type { SupabaseClient } from "@supabase/supabase-js";

import { formatKST, parseEventTime } from "@/lib/dayjs";
import {
  currentWeekNo,
  isLateJoin,
  isSessHeld,
  weekNoOf,
  type PbClassCfg,
} from "@/lib/pb-class";
import {
  PB_REC_TYPES,
  computeScoreboard,
  ruleFromJson,
  type PbRecType,
  type PbRecValue,
  type PbRule,
  type PbScoreGathering,
  type PbScoreGroup,
  type PbScoreMember,
  type PbScoreMission,
  type PbScoreboard,
} from "@/lib/pb-class-score";
import {
  cfgFromRow,
  first,
  loadCfgRow,
  loadEvtWithTeam,
  loadLinkRows,
  toPbEvent,
  type PbAttdRow,
  type PbEvent,
  type PbEvtRow,
  type PbLinkRow,
  type PbPrtRow,
} from "@/lib/queries/pb-class";
import { selectInChunks } from "@/lib/titles/query-chunk";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Database, Tables } from "@/lib/supabase/database.types";

/**
 * 겨울 10K PB 클래스 2·3단계 조회 코어 — 게임팀·목표·기록·미션·점수판.
 *
 * ## 규약 (`lib/queries/pb-class.ts`와 같다)
 * - **Supabase 클라이언트 주입식**: `server-only`·`next/*` 를 import 하지 않는다(vitest 가 직접 로드하고,
 *   향후 PAT 경로 MCP 도 부를 수 있다).
 * - **점수는 여기서 계산하지 않는다**: 전부 `lib/pb-class-score.ts`의 `computeScoreboard`가 낸다. 이 파일은
 *   행을 모아 그 입력 모양으로 조립할 뿐이다 — 회원 화면·관리자 표가 같은 숫자를 보게 하려는 것.
 * - **가져오는 일(load*)과 조립하는 일(assemble*)을 가른다**: 조립은 순수 함수라 DB 없이 경계를 테스트한다.
 */

type Db = SupabaseClient<Database>;

// ─────────────────────────────────────────
// 화면 모양 (프론트가 이 이름으로 코딩한다 — 바꾸지 말 것)
// ─────────────────────────────────────────

export type PbGameParticipant = PbScoreMember & {
  aprvYn: boolean;
  trnGrpCd: string | null;
  avatarUrl: string | null;
};

export type PbGameMission = PbScoreMission & { sortOrd: number };

export type PbGame = {
  evt: PbEvent;
  cfg: PbClassCfg;
  rule: PbRule;
  currentWkNo: number;
  /** 측정 벙 연결의 wk_no — 연결 전이면 null(최종 기록 점수는 측정이 연결돼야 붙는다) */
  measureWkNo: number | null;
  groups: PbScoreGroup[];
  missions: PbGameMission[];
  /** 승인 대기자까지 전원 — 점수판엔 승인된 사람만 들어간다 */
  participants: PbGameParticipant[];
  scoreboard: PbScoreboard;
};

// ─────────────────────────────────────────
// 조립 (순수)
// ─────────────────────────────────────────

/** assemble 이 받는 행 모양 — loader 가 DB 응답을 이 모양으로 좁혀 넘긴다 */
export type PbGamePrtRow = PbPrtRow & {
  trn_grp_cd: string | null;
  grp_id: string | null;
  goal_sec: number | null;
};
export type PbRecRow = { prt_id: string; rec_type_cd: string; rec_sec: number; cnfm_yn: boolean };
export type PbGrpRow = Pick<Tables<"evt_pb_grp_mst">, "grp_id" | "grp_nm" | "color_no" | "sort_ord">;
export type PbMsnRow = Pick<Tables<"evt_pb_msn_mst">, "msn_id" | "wk_no" | "msn_nm" | "pt" | "sort_ord">;
export type PbMsnRsltRow = { msn_id: string; grp_id: string };
export type PbGthrRow = { gthr_id: string; stt_at: string; del_yn: boolean; crt_by: string };

const isRecType = (v: string): v is PbRecType => (PB_REC_TYPES as readonly string[]).includes(v);

/** 팀 순서 — sort_ord, 같으면 이름 */
function compareGroups(a: PbGrpRow, b: PbGrpRow): number {
  return a.sort_ord - b.sort_ord || a.grp_nm.localeCompare(b.grp_nm, "ko");
}

/** 미션 순서 — 주차 오름차순(주차 없는 미션은 맨 뒤), 같으면 sort_ord */
function compareMissions(a: PbMsnRow, b: PbMsnRow): number {
  const aw = a.wk_no ?? Number.POSITIVE_INFINITY;
  const bw = b.wk_no ?? Number.POSITIVE_INFINITY;
  if (aw !== bw) return aw < bw ? -1 : 1;
  return a.sort_ord - b.sort_ord;
}

/**
 * 점수 계산에 넣을 벙 → `PbScoreGathering`.
 *
 * 입력은 이미 기간 창으로 거른 팀 벙이지만 **여기서도 열린 벙(삭제 안 됨·시작 지남)만** 남긴다 —
 * 시작 전 벙의 참석은 예약일 뿐이라 점수로 세면 안 간 회차가 점수가 된다(출석 판정과 같은 이유).
 * 연결된 벙(공식훈련·측정)은 연결의 wk_no 를 따르고, 아니면 시작 시각에서 주차를 계산한다.
 */
function toScoreGatherings(args: {
  gthrs: readonly PbGthrRow[];
  attds: readonly PbAttdRow[];
  links: readonly PbLinkRow[];
  evtSttDt: string;
  nowIso: string;
}): PbScoreGathering[] {
  const { gthrs, attds, links, evtSttDt, nowIso } = args;
  const linkByGthr = new Map(links.map((l) => [l.gthr_id, l]));

  const attendeesByGthr = new Map<string, string[]>();
  for (const a of attds) {
    const list = attendeesByGthr.get(a.gthr_id) ?? [];
    list.push(a.mem_id);
    attendeesByGthr.set(a.gthr_id, list);
  }

  const out: PbScoreGathering[] = [];
  for (const g of gthrs) {
    if (!isSessHeld({ stt_at: g.stt_at, del_yn: g.del_yn }, nowIso)) continue;
    const link = linkByGthr.get(g.gthr_id);
    const wkNo = link ? link.wk_no : weekNoOf(g.stt_at, evtSttDt);
    if (wkNo < 1) continue; // 프로젝트 시작 전 벙
    out.push({
      gthrId: g.gthr_id,
      wkNo,
      crtBy: g.crt_by,
      attendeeMemIds: attendeesByGthr.get(g.gthr_id) ?? [],
      // DB CHECK 가 TRAINING|MEASURE 만 허용한다 — 측정만 알아보고 나머지는 훈련
      linked: link ? (link.sess_type_cd === "MEASURE" ? "MEASURE" : "TRAINING") : null,
    });
  }
  return out;
}

/**
 * 게임 조립. DB 를 안 건드려서 경계(승인자만 점수판·늦은 합류·측정 주차·미션 정렬)를 테스트가 못박는다.
 *
 * 점수판은 **승인된 참가자만** 넣는다 — 입금 확인 전 신청자가 팀 평균·전원 출석 판정의 분모에 끼면
 * 아직 등록도 안 된 사람 때문에 팀 점수가 깎인다. 대기자는 `participants`에는 남아 관리자가 승인하면 합류한다.
 */
export function assembleGame(args: {
  evt: PbEvtRow;
  cfgRow: Tables<"evt_pb_cfg"> | null;
  links: readonly PbLinkRow[];
  prts: readonly PbGamePrtRow[];
  recs: readonly PbRecRow[];
  grps: readonly PbGrpRow[];
  msns: readonly PbMsnRow[];
  msnRslts: readonly PbMsnRsltRow[];
  gthrs: readonly PbGthrRow[];
  attds: readonly PbAttdRow[];
  nowIso: string;
}): PbGame {
  const { evt: evtRow, cfgRow, links, prts, recs, grps, msns, msnRslts, gthrs, attds, nowIso } = args;
  const evt = toPbEvent(evtRow);
  const cfg = cfgFromRow(cfgRow);
  const rule = ruleFromJson(cfgRow?.rule_json);

  const measureWkNo = links.find((l) => l.sess_type_cd === "MEASURE")?.wk_no ?? null;

  const recsByPrt = new Map<string, Partial<Record<PbRecType, PbRecValue>>>();
  for (const r of recs) {
    if (!isRecType(r.rec_type_cd)) continue; // DB CHECK 가 막지만 타입은 string 이라 한 번 더 좁힌다
    const m = recsByPrt.get(r.prt_id) ?? {};
    m[r.rec_type_cd] = { sec: r.rec_sec, cnfm: r.cnfm_yn };
    recsByPrt.set(r.prt_id, m);
  }

  const participants: PbGameParticipant[] = prts
    .map((p) => ({
      prtId: p.prt_id,
      memId: p.mem_id,
      memNm: p.mem_nm,
      joinWkNo: p.join_wk_no,
      late: isLateJoin(p.join_wk_no, cfg),
      grpId: p.grp_id,
      goalSec: p.goal_sec,
      recs: recsByPrt.get(p.prt_id) ?? {},
      aprvYn: p.aprv_yn,
      trnGrpCd: p.trn_grp_cd,
      avatarUrl: p.avatar_url,
    }))
    .sort((a, b) => a.memNm.localeCompare(b.memNm, "ko"));

  const sortedGrps = [...grps].sort(compareGroups);
  const groups: PbScoreGroup[] = sortedGrps.map((g) => ({ grpId: g.grp_id, grpNm: g.grp_nm, colorNo: g.color_no }));

  const succByMsn = new Map<string, string[]>();
  for (const r of msnRslts) {
    const list = succByMsn.get(r.msn_id) ?? [];
    list.push(r.grp_id);
    succByMsn.set(r.msn_id, list);
  }
  const missions: PbGameMission[] = [...msns].sort(compareMissions).map((m) => ({
    msnId: m.msn_id,
    wkNo: m.wk_no,
    msnNm: m.msn_nm,
    pt: m.pt,
    sortOrd: m.sort_ord,
    succGrpIds: succByMsn.get(m.msn_id) ?? [],
  }));

  const scoreboard = computeScoreboard({
    members: participants.filter((p) => p.aprvYn),
    gatherings: toScoreGatherings({ gthrs, attds, links, evtSttDt: evt.sttDt, nowIso }),
    groups,
    missions,
    rule,
    measureWkNo,
  });

  return {
    evt,
    cfg,
    rule,
    currentWkNo: currentWeekNo(evt.sttDt, nowIso),
    measureWkNo,
    groups,
    missions,
    participants,
    scoreboard,
  };
}

// ─────────────────────────────────────────
// 조회 (loader)
// ─────────────────────────────────────────

/**
 * 점수에 넣을 벙의 시간 창 = [W1 시작, 끝 경계). 위쪽 경계(지금)는 호출부가 따로 건다.
 *
 * 끝 경계는 측정 벙이 연결돼 있으면 **그 벙이 열린 KST 날의 끝**이다 — 측정이 끝난 뒤의 일정은 프로젝트
 * 점수 밖이다. 연결 전이거나 측정 벙이 취소(삭제)됐으면 프로젝트 종료일 끝으로 물러난다.
 * 날짜 개념이 끼는 경계라 전부 KST 자정 기준(AGENTS.md §날짜).
 */
export function scoreWindow(
  evt: Pick<PbEvtRow, "stt_dt" | "end_dt">,
  links: readonly PbLinkRow[],
): { startIso: string; endExclIso: string } {
  const measure = links.find((l) => l.sess_type_cd === "MEASURE" && !l.del_yn);
  const endDay = measure ? formatKST(measure.stt_at, "YYYY-MM-DD") : evt.end_dt;
  return {
    startIso: parseEventTime(evt.stt_dt).toISOString(),
    endExclIso: parseEventTime(endDay).add(1, "day").toISOString(),
  };
}

/**
 * 게임 전체 조회 — 관리자 화면·회원 화면·(향후) MCP 가 공유한다. 프로젝트가 없거나 `PB_CLASS`가 아니면 null.
 * `opts.teamId`를 주면 그 팀 프로젝트만 연다(서비스 롤로 읽는 관리자 경로는 반드시 넘긴다).
 */
export async function loadPbGame(
  db: Db,
  evtId: string,
  nowIso: string,
  opts: { teamId?: string } = {},
): Promise<PbGame | null> {
  const found = await loadEvtWithTeam(db, evtId, opts.teamId);
  if (!found) return null;
  const { evt, teamId } = found;

  const [cfgRow, links, prtData, recs, grps, msns, msnRslts] = await Promise.all([
    loadCfgRow(db, evtId),
    loadLinkRows(db, evtId, evt.stt_dt),
    fetchAllRows(
      () =>
        db
          .from("evt_pb_prt_rel")
          .select(
            "prt_id, mem_id, join_wk_no, deposit_amt, deposit_dc_amt, entry_fee_amt, aprv_yn, aprv_at, trn_grp_cd, grp_id, goal_sec, mem_mst(mem_nm, avatar_url)",
          )
          .eq("evt_id", evtId)
          .order("prt_id", { ascending: true }),
      { label: "pb-game:evt_pb_prt_rel" },
    ),
    // 기록은 참가자 FK 로 프로젝트에 묶인다 — 임베디드 inner 필터로 이 프로젝트 것만
    fetchAllRows(
      () =>
        db
          .from("evt_pb_rec_hist")
          .select("prt_id, rec_type_cd, rec_sec, cnfm_yn, evt_pb_prt_rel!inner(evt_id)")
          .eq("evt_pb_prt_rel.evt_id", evtId)
          .order("rec_id", { ascending: true }),
      { label: "pb-game:evt_pb_rec_hist" },
    ),
    fetchAllRows(
      () =>
        db
          .from("evt_pb_grp_mst")
          .select("grp_id, grp_nm, color_no, sort_ord")
          .eq("evt_id", evtId)
          .order("grp_id", { ascending: true }),
      { label: "pb-game:evt_pb_grp_mst" },
    ),
    fetchAllRows(
      () =>
        db
          .from("evt_pb_msn_mst")
          .select("msn_id, wk_no, msn_nm, pt, sort_ord")
          .eq("evt_id", evtId)
          .order("msn_id", { ascending: true }),
      { label: "pb-game:evt_pb_msn_mst" },
    ),
    fetchAllRows(
      () =>
        db
          .from("evt_pb_msn_rslt_rel")
          .select("msn_id, grp_id, evt_pb_msn_mst!inner(evt_id)")
          .eq("evt_pb_msn_mst.evt_id", evtId)
          .order("msn_id", { ascending: true })
          .order("grp_id", { ascending: true }),
      { label: "pb-game:evt_pb_msn_rslt_rel" },
    ),
  ]);

  const prts: PbGamePrtRow[] = prtData.map((r) => {
    const m = first(r.mem_mst);
    return {
      prt_id: r.prt_id,
      mem_id: r.mem_id,
      join_wk_no: r.join_wk_no,
      deposit_amt: r.deposit_amt,
      deposit_dc_amt: r.deposit_dc_amt,
      entry_fee_amt: r.entry_fee_amt,
      aprv_yn: r.aprv_yn,
      aprv_at: r.aprv_at,
      trn_grp_cd: r.trn_grp_cd,
      grp_id: r.grp_id,
      goal_sec: r.goal_sec,
      mem_nm: m?.mem_nm ?? "(알 수 없음)",
      avatar_url: m?.avatar_url ?? null,
    };
  });

  // 점수 대상 벙 = 팀의 열린 벙 중 [W1, 끝 경계) ∩ (≤ 지금). 공식훈련·측정이 아닌 벙(일정 참여·개설)까지 읽어야 해서
  // 연결 테이블이 아니라 팀 벙 전체를 기간으로 자른다 — gthr_id 순으로 읽어 페이지 경계가 안전하다.
  const { startIso, endExclIso } = scoreWindow(evt, links);
  const gthrs = await fetchAllRows<PbGthrRow>(
    () =>
      db
        .from("gthr_mst")
        .select("gthr_id, stt_at, del_yn, crt_by")
        .eq("team_id", teamId)
        .eq("del_yn", false)
        .gte("stt_at", startIso)
        .lt("stt_at", endExclIso)
        .lte("stt_at", nowIso)
        .order("gthr_id", { ascending: true }),
    { label: "pb-game:gthr_mst" },
  );

  // 참석은 벙 수 × 인원이라 1,000행을 쉽게 넘고, `.in()`에 id 수백 개를 한 번에 실으면 URL 이 터진다 — 청크로 읽는다
  const attds = await selectInChunks<PbAttdRow>(
    gthrs.map((g) => g.gthr_id),
    (chunk) =>
      db
        .from("gthr_attd_rel")
        .select("gthr_id, mem_id, attd_id")
        .in("gthr_id", chunk)
        .order("attd_id", { ascending: true }),
  );

  return assembleGame({
    evt,
    cfgRow,
    links,
    prts,
    recs: recs.map((r) => ({
      prt_id: r.prt_id,
      rec_type_cd: r.rec_type_cd,
      rec_sec: r.rec_sec,
      cnfm_yn: r.cnfm_yn,
    })),
    grps,
    msns,
    msnRslts: msnRslts.map((r) => ({ msn_id: r.msn_id, grp_id: r.grp_id })),
    gthrs,
    attds,
    nowIso,
  });
}
