// lib/pb-class-chart.ts — PB 클래스 「크루 출석」 그래프·출석표의 순수 계산
//
// 마일리지런의 크루 진행 차트(`components/projects/crew-progress-chart.tsx`)와 같은 자리를 PB 클래스에서
// 맡는다: 참가자 한 사람 한 사람이 회차마다 얼마나 나왔는지를 누적으로 쌓아 보여 준다.
//
// ## 무엇을 다시 계산하지 않는가
// - **회차 칸 상태는 `buildSessStrip`이 정한다.** 출석·결석·합류 전·취소·미정을 여기서 새로 판정하면
//   내 회차 띠와 이 표가 같은 칸을 다르게 말하는 날이 온다. 참가자마다 그 함수를 한 번씩 부른다.
// - **출석 수·전액 기준은 서버가 `summarizeRefund`로 낸 `summary`를 그대로 쓴다.** 정산 표·내 출석과
//   같은 숫자라 화면끼리 1회씩 어긋날 자리가 없다.
//
// ## 빈 값의 뜻 (0과 다르다)
// - 합류 전 회차 → `null`. 그 사람에겐 세지 않는 회차라 결석(0)이 아니다.
// - 아직 안 열린 회차 → `null`. 선이 거기서 끝난다(마일리지 차트의 「오늘 이후」와 같다).
// - 취소된 회차의 **인원**은 `null`(0명이 아니라 회차가 없었다). **누적**은 직전 값을 잇는다 —
//   아무도 못 나온 회차라 누구의 누적도 오르지 않았을 뿐, 떨어지지 않는다.

import { formatKST } from "@/lib/dayjs";
import { buildSessStrip, type PbClassCfg, type PbStripState } from "@/lib/pb-class";
import type { PbParticipant, PbSession } from "@/lib/queries/pb-class";

/** 열(회차) 하나의 상태 — 참가자와 무관한 회차 자체의 상태다 */
export type PbCrewColState = "held" | "canceled" | "upcoming" | "unlinked";

export type PbCrewColumn = {
  /** 축 눈금 — "1" … "12" / "측정". 열마다 유일하다(툴팁이 이걸로 열을 찾는다) */
  tick: string;
  /** "1주차" … "12주차" / "측정" */
  label: string;
  state: PbCrewColState;
  /** 연결된 벙 날짜(KST, `M/D`). 벙이 없거나 취소로 시각을 모르면 null */
  dt: string | null;
  /** 그 회차에 나온 인원 — 열린 회차만. 취소·예정·미정은 null(0명과 다르다) */
  attdCnt: number | null;
  /** 그 회차에 이미 합류해 있던 인원(분모) — 열린 회차만 */
  eligibleCnt: number | null;
};

export type PbCrewRow = {
  memId: string;
  memNm: string;
  isMe: boolean;
  joinWkNo: number;
  /** 늦은 합류 — 환급 기준이 없다 */
  late: boolean;
  /** 전액 환급 기준 출석 수(늦은 합류면 null) */
  required: number | null;
  /** 보증금 출석 수 — `summary.attdCnt` 그대로(정산 표와 같은 값) */
  attdCnt: number;
  /** 전액 기준을 채웠는가 */
  full: boolean;
  /** 열마다 이 사람의 칸 상태 — `buildSessStrip`의 결과 그대로 */
  cells: PbStripState[];
  /** 열마다 누적 출석. 합류 전·아직 안 열린 구간은 null */
  cum: (number | null)[];
};

export type PbCrewAttd = {
  columns: PbCrewColumn[];
  /** 승인된 참가자만. 나를 맨 위에, 나머지는 이름순(정산 표와 같은 순서 규칙) */
  rows: PbCrewRow[];
  /** 열마다 크루 평균 누적(그 회차에 합류해 있던 사람끼리). 소수 첫째 자리 */
  avg: (number | null)[];
  /** 마지막으로 열린 회차의 열 번호. 하나도 안 열렸으면 -1 */
  lastHeldIdx: number;
  /** 열린 회차 수 — 0이면 그릴 게 없다 */
  heldCnt: number;
  /** 전액 기준을 채운 사람 수 */
  fullCnt: number;
};

type PrtLike = Pick<PbParticipant, "memId" | "memNm" | "joinWkNo" | "aprvYn" | "attendedGthrIds" | "summary">;
type SessLike = Pick<PbSession, "gthrId" | "wkNo" | "sessType" | "held" | "delYn" | "sttAt">;

/** 축 눈금 — 열 폭이 16~23px 이라 「주차」를 떼고 숫자만 둔다. 측정은 두 글자 그대로 */
function tickOf(label: string, wkNo: number | null, isMeasure: boolean): string {
  if (isMeasure) return "측정";
  return wkNo === null ? label : String(wkNo);
}

/** 참가자와 무관한 「회차 자체」의 상태 — 아무도 안 나온 사람(합류 1주차·출석 0)으로 띠를 뽑으면 그게 곧 열 상태다 */
const COL_STATE: Record<PbStripState, PbCrewColState> = {
  missed: "held",
  attended: "held", // 빈 출석 집합이라 나오지 않지만 타입을 닫아 둔다
  upcoming: "upcoming",
  canceled: "canceled",
  unlinked: "unlinked",
  before_join: "unlinked", // 합류 1주차 기준이라 나오지 않는다
};

const round1 = (v: number) => Math.round(v * 10) / 10;

export function buildPbCrewAttd(args: {
  sessions: readonly SessLike[];
  participants: readonly PrtLike[];
  cfg: PbClassCfg;
  myMemId?: string | null;
}): PbCrewAttd {
  const { sessions, participants, cfg, myMemId } = args;
  const links = sessions.map((s) => ({ ...s }));
  const sessOf = new Map(sessions.map((s) => [s.gthrId, s]));

  const base = buildSessStrip({ links, attendedGthrIds: new Set(), joinWkNo: 1, cfg });
  const colStates = base.map((c) => COL_STATE[c.state]);
  const lastHeldIdx = colStates.lastIndexOf("held");
  const heldCnt = colStates.filter((s) => s === "held").length;

  const approved = participants
    .filter((p) => p.aprvYn)
    .sort((a, b) => {
      const aMe = a.memId === myMemId;
      const bMe = b.memId === myMemId;
      if (aMe !== bMe) return aMe ? -1 : 1;
      return a.memNm.localeCompare(b.memNm, "ko");
    });

  const rows: PbCrewRow[] = approved.map((p) => {
    const cells = buildSessStrip({
      links,
      attendedGthrIds: new Set(p.attendedGthrIds),
      joinWkNo: p.joinWkNo,
      cfg,
    }).map((c) => c.state);

    let running = 0;
    const cum = cells.map((state, i) => {
      if (i > lastHeldIdx || state === "before_join") return null;
      if (state === "attended") running += 1;
      return running;
    });

    const { attdCnt, required, late } = p.summary;
    return {
      memId: p.memId,
      memNm: p.memNm,
      isMe: p.memId === myMemId,
      joinWkNo: p.joinWkNo,
      late,
      required,
      attdCnt,
      full: required !== null && attdCnt >= required,
      cells,
      cum,
    };
  });

  const columns: PbCrewColumn[] = base.map((c, i) => {
    const state = colStates[i];
    const sess = c.gthrId ? sessOf.get(c.gthrId) : undefined;
    // 취소된 벙은 시각을 모를 수 있다(회원 세션은 RLS 에 막혀 loader 가 주차 수요일로 채운다) — 지어낸 날짜를 찍지 않는다
    const dt = sess && state !== "canceled" ? formatKST(sess.sttAt, "M/D") : null;
    const held = state === "held";
    return {
      tick: tickOf(c.label, c.wkNo, c.sessType === "MEASURE"),
      label: c.label,
      state,
      dt,
      attdCnt: held ? rows.filter((r) => r.cells[i] === "attended").length : null,
      eligibleCnt: held ? rows.filter((r) => r.cells[i] !== "before_join").length : null,
    };
  });

  const avg = columns.map((_, i) => {
    const vals = rows.map((r) => r.cum[i]).filter((v): v is number => v !== null);
    return vals.length > 0 ? round1(vals.reduce((n, v) => n + v, 0) / vals.length) : null;
  });

  return {
    columns,
    rows,
    avg,
    lastHeldIdx,
    heldCnt,
    fullCnt: rows.filter((r) => r.full).length,
  };
}

// ─────────────────────────────────────────
// 차트 모양 (recharts 한 행 = 한 회차)
// ─────────────────────────────────────────

/** 나 아닌 참가자의 시리즈 키 — `s0`, `s1` … (mem_id 를 키로 쓰면 툴팁·DOM 에 id 가 샌다) */
export const crewSeriesKey = (i: number) => `s${i}`;

export type PbCrewPoint = {
  tick: string;
  me: number | null;
  avg: number | null;
  [series: string]: string | number | null;
};

export type PbCrewChartData = {
  points: PbCrewPoint[];
  /** 나 아닌 참가자 수만큼의 시리즈 키 */
  seriesKeys: string[];
  /** 내 전액 기준선 — 늦은 합류·내 행이 없으면 null(선을 안 긋는다) */
  myRequired: number | null;
  /** 세로축 끝 = 총 회차(측정 포함). 시즌 끝까지의 거리가 보이게 지금 값이 아니라 끝을 잡는다 */
  yMax: number;
  /** 마지막으로 열린 회차 기준 — 범례가 판독값으로 쓴다 */
  meNow: number | null;
  avgNow: number | null;
};

export function toPbCrewChartData(crew: PbCrewAttd): PbCrewChartData {
  const me = crew.rows.find((r) => r.isMe) ?? null;
  const others = crew.rows.filter((r) => !r.isMe);
  const seriesKeys = others.map((_, i) => crewSeriesKey(i));

  const points = crew.columns.map((col, i) => {
    const point: PbCrewPoint = { tick: col.tick, me: me?.cum[i] ?? null, avg: crew.avg[i] };
    others.forEach((r, j) => {
      point[seriesKeys[j]] = r.cum[i];
    });
    return point;
  });

  const at = crew.lastHeldIdx;
  return {
    points,
    seriesKeys,
    myRequired: me?.required ?? null,
    yMax: crew.columns.length,
    meNow: at >= 0 ? (me?.cum[at] ?? null) : null,
    avgNow: at >= 0 ? crew.avg[at] : null,
  };
}

/** 세로축 눈금 — 3회 간격(0·3·6·9·12). 기준선은 따로 라벨을 달므로 눈금에 넣지 않는다 */
export function crewYTicks(yMax: number): number[] {
  const out: number[] = [];
  for (let v = 0; v <= yMax; v += 3) out.push(v);
  return out;
}

/** "4" / "4.2" — 정수면 소수점을 떼고 읽는다 */
export function formatCnt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// ─────────────────────────────────────────
// 한 줄 요약 (그래프 위 — 상태를 먼저 말하고 근거를 뒤에)
// ─────────────────────────────────────────

export type PbCrewGlance = {
  /** "6주차" / "측정" */
  label: string;
  attdCnt: number;
  eligibleCnt: number;
  /** 다 나왔나 — 「22명 모두」로 말한다 */
  all: boolean;
  fullCnt: number;
};

/** 마지막으로 열린 회차의 인원 — 열린 회차가 없으면 null(그래프 대신 빈 상태가 선다) */
export function crewGlance(crew: PbCrewAttd): PbCrewGlance | null {
  const col = crew.columns[crew.lastHeldIdx];
  if (!col || col.attdCnt === null || col.eligibleCnt === null) return null;
  return {
    label: col.label,
    attdCnt: col.attdCnt,
    eligibleCnt: col.eligibleCnt,
    all: col.eligibleCnt > 0 && col.attdCnt === col.eligibleCnt,
    fullCnt: crew.fullCnt,
  };
}
