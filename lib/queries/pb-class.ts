import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PB_CLASS_DEFAULT_CFG,
  PB_CLASS_TYPE,
  currentWeekNo,
  isSessHeld,
  summarizeRefund,
  weekNoOf,
  type PbClassCfg,
  type PbRefundSummary,
  type PbSessLink,
  type PbSessType,
} from "@/lib/pb-class";
import { parseEventTime } from "@/lib/dayjs";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Database, Tables } from "@/lib/supabase/database.types";

/**
 * 겨울 10K PB 클래스 조회 코어 — 회원 화면·관리자 화면·(향후) 운영 MCP가 공유한다.
 *
 * ## 규약 (`lib/mileage-run.ts`와 같다)
 * - **Supabase 클라이언트 주입식**: `server-only`·`next/*` 를 import 하지 않는다. 덕분에 vitest 가
 *   직접 로드하고, 세션 쿠키에 묶인 서버 액션이 아닌 PAT 경로에서도 부를 수 있다.
 * - **금전 계산은 여기서 하지 않는다**: 환급·기준은 전부 `lib/pb-class.ts`의 `summarizeRefund`가
 *   낸다. 이 파일은 행을 모아 그 함수에 넘기고 결과를 화면 모양으로 조립할 뿐이다 — 회원 화면과
 *   관리자 표가 같은 숫자를 보게 하려는 것(한쪽만 고쳐지는 날 사람 돈이 어긋난다).
 * - **가져오는 일(load*)과 조립하는 일(assemble*)을 가른다**: 조립은 순수 함수라 DB 없이 경계를
 *   테스트한다. PostgREST 상한(1,000행)·임베디드 조인은 가짜 DB로 흉내 내기 어려워 loader 는 얇게 둔다.
 */

type Db = SupabaseClient<Database>;

// ─────────────────────────────────────────
// 화면 모양 (프론트가 이 이름으로 코딩한다 — 바꾸지 말 것)
// ─────────────────────────────────────────

export type PbEvent = {
  evtId: string;
  evtNm: string;
  sttDt: string;
  endDt: string;
  sttsEnm: "READY" | "ACTIVE" | "CLOSED";
};

/**
 * 공식훈련·측정으로 연결된 벙 한 건.
 *
 * - `attdCnt`: 그 벙에 참석한 **승인된** 참가자 수(합류 주차가 그 회차 이전인 사람만).
 *   `loadMyPbClass`에서는 0이다(남의 출석을 회원 화면에 싣지 않는다).
 * - `computedWkNo`: 벙 `stt_at`에서 **지금** 계산한 주차. 저장값(`wkNo`)과 다르면 연결 뒤에
 *   벙 날짜가 바뀐 것이라 관리자 회차 탭이 경고를 띄운다.
 */
export type PbSession = PbSessLink & {
  gthrNm: string;
  sttAt: string;
  delYn: boolean;
  computedWkNo: number;
  attdCnt: number;
};

export type PbParticipant = {
  prtId: string;
  memId: string;
  memNm: string;
  avatarUrl: string | null;
  joinWkNo: number;
  depositAmt: number;
  entryFeeAmt: number;
  aprvYn: boolean;
  aprvAt: string | null;
  summary: PbRefundSummary;
  /** 연결된 벙 중 이 사람이 참석한 벙 id — 회차 띠(`buildSessStrip`)에 그대로 넘긴다 */
  attendedGthrIds: string[];
};

/** 합계는 **승인된 참가자만** 더한다 — 입금 확인 전 신청은 아직 받은 돈이 아니다 */
export type PbTotals = {
  aprvCnt: number;
  pendingCnt: number;
  depositSum: number;
  refundSum: number;
  unrefundedSum: number;
  entryFeeSum: number;
};

export type PbClassBoard = {
  evt: PbEvent;
  cfg: PbClassCfg;
  /** evt_pb_cfg 행이 실제로 있는가 — 없으면 기본값으로 돌고 있다는 뜻(관리자 화면이 안내한다) */
  cfgSaved: boolean;
  sessions: PbSession[];
  participants: PbParticipant[];
  totals: PbTotals;
};

export type MyPbClass = {
  evt: PbEvent;
  cfg: PbClassCfg;
  sessions: PbSession[];
  /** 신청 전이면 null. 입금 대기(`aprvYn=false`)도 행이 있으므로 null 이 아니다 */
  me: PbParticipant | null;
  currentWkNo: number;
};

// ─────────────────────────────────────────
// 설정 행 ↔ PbClassCfg
// ─────────────────────────────────────────

/** evt_pb_cfg 행 → 설정. 행이 없으면(관리자가 아직 저장 안 함) 기본값이다 */
export function cfgFromRow(row: Tables<"evt_pb_cfg"> | null): PbClassCfg {
  if (!row) return { ...PB_CLASS_DEFAULT_CFG };
  return {
    totSessCnt: row.tot_sess_cnt,
    fullRfndAttdCnt: row.full_rfnd_attd_cnt,
    lateJoinWkNo: row.late_join_wk_no,
    depositAmt: row.deposit_amt,
    entryFeeAmt: row.entry_fee_amt,
  };
}

// ─────────────────────────────────────────
// 조립 (순수)
// ─────────────────────────────────────────

/** assemble 이 받는 행 모양 — loader 가 DB 응답을 이 모양으로 좁혀 넘긴다 */
export type PbEvtRow = Pick<
  Tables<"evt_team_mst">,
  "evt_id" | "evt_nm" | "stt_dt" | "end_dt" | "stts_enm"
>;
export type PbLinkRow = {
  gthr_id: string;
  wk_no: number;
  sess_type_cd: string;
  gthr_nm: string;
  stt_at: string;
  del_yn: boolean;
};
export type PbPrtRow = Pick<
  Tables<"evt_pb_prt_rel">,
  "prt_id" | "mem_id" | "join_wk_no" | "deposit_amt" | "entry_fee_amt" | "aprv_yn" | "aprv_at"
> & {
  mem_nm: string;
  avatar_url: string | null;
};
export type PbAttdRow = { gthr_id: string; mem_id: string };

export function toPbEvent(row: PbEvtRow): PbEvent {
  return {
    evtId: row.evt_id,
    evtNm: row.evt_nm,
    sttDt: row.stt_dt,
    endDt: row.end_dt,
    sttsEnm: row.stts_enm,
  };
}

/** 연결 행 → 회차(시계·주차 계산 포함). `attdCnt`는 호출부가 채운다 */
function toSessions(rows: readonly PbLinkRow[], evt: PbEvent, nowIso: string): PbSession[] {
  return rows
    .map((r) => ({
      gthrId: r.gthr_id,
      wkNo: r.wk_no,
      // DB CHECK 가 TRAINING|MEASURE 두 값만 허용한다. 타입은 varchar 라 string 으로 오므로
      // 측정만 정확히 알아보고 나머지는 훈련으로 둔다(회차 띠는 wkNo 로 줄을 세워 깨지지 않는다).
      sessType: (r.sess_type_cd === "MEASURE" ? "MEASURE" : "TRAINING") as PbSessType,
      held: isSessHeld({ stt_at: r.stt_at, del_yn: r.del_yn }, nowIso),
      gthrNm: r.gthr_nm,
      sttAt: r.stt_at,
      delYn: r.del_yn,
      computedWkNo: weekNoOf(r.stt_at, evt.sttDt),
      attdCnt: 0,
    }))
    .sort((a, b) => a.wkNo - b.wkNo);
}

function toParticipant(
  row: PbPrtRow,
  sessions: readonly PbSession[],
  attended: ReadonlySet<string>,
  cfg: PbClassCfg,
): PbParticipant {
  return {
    prtId: row.prt_id,
    memId: row.mem_id,
    memNm: row.mem_nm,
    avatarUrl: row.avatar_url,
    joinWkNo: row.join_wk_no,
    depositAmt: row.deposit_amt,
    entryFeeAmt: row.entry_fee_amt,
    aprvYn: row.aprv_yn,
    aprvAt: row.aprv_at,
    // 입금 대기자도 같은 함수로 요약한다 — 승인되면 숫자가 바뀌지 않고 그대로 확정된다
    summary: summarizeRefund({
      joinWkNo: row.join_wk_no,
      depositAmt: row.deposit_amt,
      links: sessions,
      attendedGthrIds: attended,
      cfg,
    }),
    attendedGthrIds: sessions.filter((s) => attended.has(s.gthrId)).map((s) => s.gthrId),
  };
}

/** mem_id → 그 사람이 참석한 연결 벙 id 집합 */
function groupAttended(rows: readonly PbAttdRow[]): Map<string, Set<string>> {
  const byMem = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = byMem.get(r.mem_id) ?? new Set<string>();
    set.add(r.gthr_id);
    byMem.set(r.mem_id, set);
  }
  return byMem;
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/** 입금 대기 먼저(운영진이 처리할 일), 그 안에서 이름순(한글) */
function compareParticipants(a: PbParticipant, b: PbParticipant): number {
  if (a.aprvYn !== b.aprvYn) return a.aprvYn ? 1 : -1;
  return a.memNm.localeCompare(b.memNm, "ko");
}

/**
 * 관리자 보드 조립. DB 를 안 건드려서 경계(합류 전 주차·미개최·삭제·대기자 합계 제외)를
 * 테스트가 그대로 못박는다.
 */
export function assembleBoard(args: {
  evt: PbEvtRow;
  cfgRow: Tables<"evt_pb_cfg"> | null;
  links: readonly PbLinkRow[];
  prts: readonly PbPrtRow[];
  attds: readonly PbAttdRow[];
  nowIso: string;
}): PbClassBoard {
  const { evt: evtRow, cfgRow, links, prts, attds, nowIso } = args;
  const evt = toPbEvent(evtRow);
  const cfg = cfgFromRow(cfgRow);
  const sessions = toSessions(links, evt, nowIso);
  const attendedByMem = groupAttended(attds);

  const participants = prts
    .map((p) => toParticipant(p, sessions, attendedByMem.get(p.mem_id) ?? EMPTY_SET, cfg))
    .sort(compareParticipants);

  // 벙별 참석 인원 = 승인된 참가자 중 그 회차 이전에 합류한 사람의 참석.
  // 합류 전 주차의 참석은 환급에도 점수에도 안 세므로(#577 리뷰 6번) 이 숫자도 같은 기준을 따른다.
  const approved = participants.filter((p) => p.aprvYn);
  for (const s of sessions) {
    s.attdCnt = approved.filter((p) => p.joinWkNo <= s.wkNo && p.attendedGthrIds.includes(s.gthrId)).length;
  }

  const totals: PbTotals = {
    aprvCnt: approved.length,
    pendingCnt: participants.length - approved.length,
    depositSum: approved.reduce((n, p) => n + p.depositAmt, 0),
    refundSum: approved.reduce((n, p) => n + p.summary.refund, 0),
    unrefundedSum: approved.reduce((n, p) => n + p.summary.unrefunded, 0),
    entryFeeSum: approved.reduce((n, p) => n + p.entryFeeAmt, 0),
  };

  return { evt, cfg, cfgSaved: cfgRow !== null, sessions, participants, totals };
}

/** 회원 화면 조립 — 내 행 하나와 회차 목록만. 남의 출석·합계는 싣지 않는다 */
export function assembleMyPbClass(args: {
  evt: PbEvtRow;
  cfgRow: Tables<"evt_pb_cfg"> | null;
  links: readonly PbLinkRow[];
  myPrt: PbPrtRow | null;
  myAttds: readonly PbAttdRow[];
  nowIso: string;
}): MyPbClass {
  const { evt: evtRow, cfgRow, links, myPrt, myAttds, nowIso } = args;
  const evt = toPbEvent(evtRow);
  const cfg = cfgFromRow(cfgRow);
  const sessions = toSessions(links, evt, nowIso);
  const me = myPrt
    ? toParticipant(myPrt, sessions, new Set(myAttds.map((a) => a.gthr_id)), cfg)
    : null;
  return { evt, cfg, sessions, me, currentWkNo: currentWeekNo(evt.sttDt, nowIso) };
}

// ─────────────────────────────────────────
// 조회 (loader)
// ─────────────────────────────────────────

/** 임베디드 관계는 1:1 이면 객체, 아니면 배열로 올 수 있다 — 첫 값으로 좁힌다 */
export function first<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * 프로젝트 행 + 소속 팀 id. 2·3단계(`pb-class-game.ts`)가 팀 벙을 읽으려면 팀 id 가 필요해 같이 돌려준다.
 * `loadEvt`는 이걸 감싸 phase-1 호출부 모양(행만)을 그대로 지킨다.
 */
export async function loadEvtWithTeam(
  db: Db,
  evtId: string,
  teamId?: string,
): Promise<{ evt: PbEvtRow; teamId: string } | null> {
  let q = db
    .from("evt_team_mst")
    .select("evt_id, evt_nm, stt_dt, end_dt, stts_enm, evt_type_cd, team_id")
    .eq("evt_id", evtId);
  // 관리자 액션은 팀을 넘겨 다른 팀 프로젝트가 id 추측만으로 열리지 않게 한다
  if (teamId) q = q.eq("team_id", teamId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`loadPbEvt 조회 실패: ${error.message}`);
  if (!data || data.evt_type_cd !== PB_CLASS_TYPE) return null;
  return {
    teamId: data.team_id,
    evt: {
      evt_id: data.evt_id,
      evt_nm: data.evt_nm,
      stt_dt: data.stt_dt,
      end_dt: data.end_dt,
      stts_enm: data.stts_enm,
    },
  };
}

export async function loadEvt(db: Db, evtId: string, teamId?: string): Promise<PbEvtRow | null> {
  return (await loadEvtWithTeam(db, evtId, teamId))?.evt ?? null;
}

export async function loadCfgRow(db: Db, evtId: string): Promise<Tables<"evt_pb_cfg"> | null> {
  const { data, error } = await db.from("evt_pb_cfg").select("*").eq("evt_id", evtId).maybeSingle();
  if (error) throw new Error(`loadPbCfg 조회 실패: ${error.message}`);
  return data;
}

export async function loadLinkRows(db: Db, evtId: string, evtSttDt: string): Promise<PbLinkRow[]> {
  // 연결은 프로젝트당 많아야 십수 건(12주 + 측정)이라 한 번에 읽어도 상한에 닿지 않는다
  const { data, error } = await db
    .from("evt_gthr_rel")
    .select("gthr_id, wk_no, sess_type_cd, gthr_mst(gthr_nm, stt_at, del_yn)")
    .eq("evt_id", evtId)
    .order("wk_no", { ascending: true });
  if (error) throw new Error(`loadPbLinks 조회 실패: ${error.message}`);
  const out: PbLinkRow[] = [];
  for (const r of data ?? []) {
    const g = first(r.gthr_mst);
    // 벙이 안 보이면 **삭제된(한파 취소) 벙**이다. 행 자체는 FK(CASCADE)로 남아 있지만 회원 세션은
    // gthr_mst RLS(`del_yn = false`)에 막혀 임베드가 null 로 온다(관리자 화면은 service role 이라 보인다).
    // 건너뛰면 회원 띠에서 그 칸이 `취소`가 아니라 `미정`으로 보여 관리자 화면과 말이 갈린다 —
    // 취소로 살려 둔다. 시각은 모르니 그 주차의 수요일로 채워 주차 불일치 경고가 헛돌지 않게 한다.
    if (!g) {
      out.push({
        gthr_id: r.gthr_id,
        wk_no: r.wk_no,
        sess_type_cd: r.sess_type_cd,
        gthr_nm: "취소된 벙",
        stt_at: parseEventTime(evtSttDt).add((r.wk_no - 1) * 7, "day").toISOString(),
        del_yn: true,
      });
      continue;
    }
    out.push({
      gthr_id: r.gthr_id,
      wk_no: r.wk_no,
      sess_type_cd: r.sess_type_cd,
      gthr_nm: g.gthr_nm,
      stt_at: g.stt_at,
      del_yn: g.del_yn,
    });
  }
  return out;
}

function toPrtRow(r: {
  prt_id: string;
  mem_id: string;
  join_wk_no: number;
  deposit_amt: number;
  entry_fee_amt: number;
  aprv_yn: boolean;
  aprv_at: string | null;
  mem_mst: { mem_nm: string; avatar_url: string | null } | { mem_nm: string; avatar_url: string | null }[] | null;
}): PbPrtRow {
  const m = first(r.mem_mst);
  return {
    prt_id: r.prt_id,
    mem_id: r.mem_id,
    join_wk_no: r.join_wk_no,
    deposit_amt: r.deposit_amt,
    entry_fee_amt: r.entry_fee_amt,
    aprv_yn: r.aprv_yn,
    aprv_at: r.aprv_at,
    mem_nm: m?.mem_nm ?? "(알 수 없음)",
    avatar_url: m?.avatar_url ?? null,
  };
}

const PRT_SELECT =
  "prt_id, mem_id, join_wk_no, deposit_amt, entry_fee_amt, aprv_yn, aprv_at, mem_mst(mem_nm, avatar_url)";

/**
 * 연결된 벙들의 참석 행.
 *
 * 사람 수 × 회차만큼 늘어나(참가 100명 × 13회 = 1,300행) PostgREST 1,000행 상한을 넘는다 —
 * 넘는 순간 에러 없이 잘려 **환급액이 낮게 계산**된다. 그래서 `fetchAllRows`(PK 정렬)로 읽는다.
 */
async function loadAttdRows(db: Db, gthrIds: readonly string[], memId?: string): Promise<PbAttdRow[]> {
  if (gthrIds.length === 0) return [];
  return fetchAllRows<PbAttdRow>(
    () => {
      let q = db.from("gthr_attd_rel").select("gthr_id, mem_id").in("gthr_id", [...gthrIds]);
      if (memId) q = q.eq("mem_id", memId);
      return q.order("attd_id", { ascending: true });
    },
    { label: "pb-class:gthr_attd_rel" },
  );
}

/**
 * 관리자 보드 — 설정·연결 벙·참가자(출석·환급 요약)·합계.
 * 프로젝트가 없거나 `PB_CLASS`가 아니면 null. `opts.teamId`를 주면 그 팀 프로젝트만 연다.
 */
export async function loadPbClassBoard(
  db: Db,
  evtId: string,
  nowIso: string,
  opts: { teamId?: string } = {},
): Promise<PbClassBoard | null> {
  const evt = await loadEvt(db, evtId, opts.teamId);
  if (!evt) return null;

  const [cfgRow, links, prtData] = await Promise.all([
    loadCfgRow(db, evtId),
    loadLinkRows(db, evtId, evt.stt_dt),
    fetchAllRows(
      () => db.from("evt_pb_prt_rel").select(PRT_SELECT).eq("evt_id", evtId).order("prt_id", { ascending: true }),
      { label: "pb-class:evt_pb_prt_rel" },
    ),
  ]);
  const prts = prtData.map(toPrtRow);
  const attds = await loadAttdRows(db, links.map((l) => l.gthr_id));

  return assembleBoard({ evt, cfgRow, links, prts, attds, nowIso });
}

/** 회원 화면용 — 내 참가 행 하나와 회차 목록. 남의 출석은 읽지도 않는다 */
export async function loadMyPbClass(
  db: Db,
  evtId: string,
  memId: string,
  nowIso: string,
): Promise<MyPbClass | null> {
  const evt = await loadEvt(db, evtId);
  if (!evt) return null;

  const [cfgRow, links, myPrtData] = await Promise.all([
    loadCfgRow(db, evtId),
    loadLinkRows(db, evtId, evt.stt_dt),
    db.from("evt_pb_prt_rel").select(PRT_SELECT).eq("evt_id", evtId).eq("mem_id", memId).maybeSingle(),
  ]);
  if (myPrtData.error) throw new Error(`loadMyPbClass 참가 조회 실패: ${myPrtData.error.message}`);
  const myPrt = myPrtData.data ? toPrtRow(myPrtData.data) : null;
  const myAttds = myPrt ? await loadAttdRows(db, links.map((l) => l.gthr_id), memId) : [];

  return assembleMyPbClass({ evt, cfgRow, links, myPrt, myAttds, nowIso });
}
