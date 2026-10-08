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
import type { PbGroupScore, PbRecType, PbRule, PbScoreMember, PbScoreboard } from "@/lib/pb-class-score";
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

// ─────────────────────────────────────────
// 팀별 점수 그래프 (점수판 — 누구에게나 공개)
// ─────────────────────────────────────────
//
// 팀 점수는 저장하지 않고 `computeScoreboard`가 매번 낸다. 그래프도 그 결과(`PbScoreboard`)를
// **같은 공식으로** 주차별로 쪼갤 뿐이다 — 주차 w 의 증분 = (그 주 등록 팀원 평균) + (그 주 전원 출석이면 보너스).
// 쪼갠 조각을 다 더하면 순위표의 `PbGroupScore.total`과 같아야 한다. 다르면 그래프와 순위표가
// 서로 다른 점수를 말하는 화면이 된다(테스트가 이 등식을 못박는다).

export type PbTeamSeriesTeam = {
  grpId: string;
  grpNm: string;
  colorNo: number | null;
  rank: number;
  /** 순위표와 같은 값 — 그래프 마지막 점이 반드시 이 값이다 */
  total: number;
  /** 주차별 누적 점수(소수 첫째 자리). `weeks`와 같은 길이 */
  cum: number[];
  /** 주차별 그 주에 얻은 점수(평균 + 전원 출석, 소수 첫째 자리). 툴팁의 「+12.5」 */
  gain: number[];
};

export type PbTeamSeries = {
  /** 1 … lastWk — 점수가 하나라도 난 마지막 주차까지 */
  weeks: number[];
  /** 순위표 순서 그대로(코어가 정렬한 순서 — 화면이 다시 정렬하지 않는다) */
  teams: PbTeamSeriesTeam[];
};

type SeriesMemberLike = Pick<PbScoreMember, "prtId" | "joinWkNo">;

/**
 * 팀 하나의 주차별 증분(반올림 전) — 코어 `computeScoreboard`와 같은 규칙.
 * - 분모는 **그 주에 등록돼 있던** 팀전 대상(늦은 합류 아님·이 팀 배정 = 코어의 `inGame`)이다.
 *   합류 전 주차엔 분모에도 없다 — 중간 합류자를 받은 팀이 손해 보지 않게 하는 코어의 장치 그대로.
 * - 전원 출석 보너스는 코어가 이미 판정한 주(`allAttendWeeks`)를 그대로 쓴다(여기서 다시 판정하지 않는다).
 */
export function teamWeekGains(args: {
  grp: Pick<PbGroupScore, "grpId" | "allAttendWeeks">;
  scoreboard: Pick<PbScoreboard, "members">;
  joinWkByPrt: ReadonlyMap<string, number>;
  rule: Pick<PbRule, "pt">;
  lastWk: number;
}): number[] {
  const { grp, scoreboard, joinWkByPrt, rule, lastWk } = args;
  const team = scoreboard.members.filter((m) => m.inGame && m.grpId === grp.grpId);
  const bonusWeeks = new Set(grp.allAttendWeeks);

  return Array.from({ length: lastWk }, (_, i) => {
    const wk = i + 1;
    // 합류 주차를 모르면(참가자 목록에서 빠진 이상한 경우) 1주차로 본다 — 코어도 그 사람을 팀에 넣어 계산했다
    const reg = team.filter((m) => (joinWkByPrt.get(m.prtId) ?? 1) <= wk);
    let gain = 0;
    if (reg.length > 0) {
      const sum = reg.reduce((s, m) => s + m.entries.filter((e) => e.wkNo === wk).reduce((a, e) => a + e.pt, 0), 0);
      gain += sum / reg.length;
    }
    if (bonusWeeks.has(wk)) gain += rule.pt.allAttend;
    return gain;
  });
}

/**
 * 팀별 누적 점수 시리즈. 팀이 없거나 아직 아무 점수도 안 났으면 null(그래프 대신 빈 상태가 선다).
 *
 * 마지막 점은 순위표의 `total`로 **맞춘다**: 같은 실수들을 코어와 다른 순서로 더하면 아주 드물게
 * 반올림 경계(x.x5)에서 0.1 이 갈릴 수 있다. 그래프 끝과 순위표 숫자가 다르면 어느 쪽이 맞는지 알 길이
 * 없으니 정본(순위표)에 붙인다. 증분 계산 자체가 코어와 같다는 건 `teamWeekGains` 테스트가 따로 지킨다.
 */
export function buildPbTeamSeries(args: {
  scoreboard: PbScoreboard;
  members: readonly SeriesMemberLike[];
  rule: Pick<PbRule, "pt">;
}): PbTeamSeries | null {
  const { scoreboard, members, rule } = args;
  if (scoreboard.groups.length === 0) return null;

  const grpIds = new Set(scoreboard.groups.map((g) => g.grpId));
  let lastWk = 0;
  for (const m of scoreboard.members) {
    if (!m.inGame || !m.grpId || !grpIds.has(m.grpId)) continue;
    for (const e of m.entries) if (e.pt > 0) lastWk = Math.max(lastWk, e.wkNo);
  }
  for (const g of scoreboard.groups) for (const wk of g.allAttendWeeks) lastWk = Math.max(lastWk, wk);
  if (lastWk === 0) return null;

  const joinWkByPrt = new Map(members.map((m) => [m.prtId, m.joinWkNo]));
  const weeks = Array.from({ length: lastWk }, (_, i) => i + 1);

  const teams = scoreboard.groups.map((g): PbTeamSeriesTeam => {
    const raw = teamWeekGains({ grp: g, scoreboard, joinWkByPrt, rule, lastWk });
    let running = 0;
    const cum = raw.map((v) => {
      running += v;
      return round1(running);
    });
    cum[cum.length - 1] = g.total;
    return {
      grpId: g.grpId,
      grpNm: g.grpNm,
      colorNo: g.colorNo,
      rank: g.rank,
      total: g.total,
      cum,
      gain: raw.map(round1),
    };
  });

  return { weeks, teams };
}

const Y_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000] as const;

/**
 * 세로축 — 1위 점수 위로 조금 여유를 두고, 눈금이 **정수로 딱 떨어지는** 간격(5·10·20·25·50…)을 고른다.
 * 끝값을 4등분하면 12.5 같은 눈금이 생겨 점수판의 「정수면 정수로」(`formatPt`) 표기와 어긋난다.
 * 눈금은 많아야 다섯 칸 — 200px 높이에 그 이상이면 글자가 붙는다.
 */
export function teamYAxis(series: PbTeamSeries): { max: number; ticks: number[] } {
  const top = Math.max(0, ...series.teams.map((t) => t.total)) * 1.08;
  const step = Y_STEPS.find((s) => Math.ceil(top / s) <= 5) ?? Y_STEPS[Y_STEPS.length - 1];
  const max = Math.max(step, Math.ceil(top / step) * step);
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step) };
}

// ─────────────────────────────────────────
// 10K 예상기록 트랙 (점수판 — 승인된 참가자에게만)
// ─────────────────────────────────────────
//
// 가로 한 줄 트랙에 참가자를 예상 10K 기록 자리에 세운다 — **왼쪽이 느리고 오른쪽이 빠르다**(오너:
// 「느린 사람 왼쪽 빠른 사람 오른쪽」). 결승선이 오른쪽에 있는 그림이라 빠를수록 앞서 있다.
// 이름·기록이 같이 실리므로 크루 출석과 같은 공개 범위다(점수판이 승인된 참가자에게만 그린다).

export type PbPredicted10k = {
  sec: number;
  /** 어디서 왔나 — 「10K 측정 기록」 / 「6주차 5K × 2.085」 / 「1주차 5K × 2.085」 */
  basis: string;
  src: Extract<PbRecType, "FINAL_10K" | "MID_5K" | "BASE_5K">;
};

/**
 * 예상 10K = 측정 10K 실제 기록이 있으면 그것, 없으면 **가장 최근 5K**(중간점검 → 1주차) × 환산 계수.
 *
 * 기록의 확정 여부(`cnfm`)는 보지 않는다 — 기록은 이제 본인이 적는 즉시 확정된다(확인 단계 없음).
 * 내 P(`trainingPace`)도 같은 기록을 같은 방식으로 읽는다 — 훈련 탭과 이 트랙이 다른 기록을 보지 않게.
 * 대구마라톤 10K 는 시즌 밖 대회라 예상기록의 근거로 쓰지 않는다.
 */
export function predicted10k(
  member: Pick<PbScoreMember, "recs">,
  rule: Pick<PbRule, "tenKFactor" | "midWkNo">,
): PbPredicted10k | null {
  const valid = (t: PbRecType) => {
    const sec = member.recs[t]?.sec;
    return sec && sec > 0 ? sec : null;
  };
  const fin = valid("FINAL_10K");
  if (fin) return { sec: fin, basis: "10K 측정 기록", src: "FINAL_10K" };
  const factorTxt = String(rule.tenKFactor);
  const mid = valid("MID_5K");
  if (mid) {
    return { sec: Math.round(mid * rule.tenKFactor), basis: `${rule.midWkNo}주차 5K × ${factorTxt}`, src: "MID_5K" };
  }
  const base = valid("BASE_5K");
  if (base) return { sec: Math.round(base * rule.tenKFactor), basis: `1주차 5K × ${factorTxt}`, src: "BASE_5K" };
  return null;
}

/**
 * 레인 배치 — 가까이 선 사람끼리 포개지면 손가락으로 못 고른다. 왼쪽부터 훑으며 **첫 번째로 자리가 나는
 * 레인**에 세운다(같은 레인 안에선 이웃과 `minGap` 이상 떨어진다). 레인이 `maxLanes`에 차면 더 쌓지 않고
 * 이웃과 가장 덜 겹치는 레인에 끼운다 — 트랙이 끝없이 높아지는 것보다 조금 겹치는 쪽이 낫다.
 *
 * `pin`(나)은 맨 먼저 0번(맨 위) 레인에 세운다: 내 이름표는 늘 떠 있어서 맨 윗레인이어야 남을 가리지 않는다.
 * 결정적이다(같은 입력 → 같은 배치) — 서버·클라이언트가 같은 그림을 그려야 하이드레이션이 흔들리지 않는다.
 */
export function layoutTrackLanes(
  items: readonly { id: string; x: number; pin?: boolean }[],
  opts: { minGap: number; maxLanes: number },
): { laneOf: Map<string, number>; laneCnt: number } {
  const { minGap, maxLanes } = opts;
  const lanes: number[][] = [];
  const laneOf = new Map<string, number>();
  const place = (id: string, x: number, lane: number) => {
    (lanes[lane] ??= []).push(x);
    laneOf.set(id, lane);
  };
  const nearest = (lane: number[], x: number) => lane.reduce((d, v) => Math.min(d, Math.abs(v - x)), Infinity);

  const pinned = items.filter((it) => it.pin);
  const rest = items.filter((it) => !it.pin).sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  for (const it of pinned) place(it.id, it.x, 0);

  for (const it of rest) {
    const free = lanes.findIndex((lane) => nearest(lane, it.x) >= minGap);
    if (free >= 0) {
      place(it.id, it.x, free);
    } else if (lanes.length < maxLanes) {
      place(it.id, it.x, lanes.length);
    } else {
      // 꽉 찼다 — 가장 덜 겹치는 레인(같으면 위쪽). 내가 있는 0번 레인은 내 이름표 자리라 피한다
      let best = -1;
      let bestD = -1;
      lanes.forEach((lane, i) => {
        if (i === 0 && pinned.length > 0 && lanes.length > 1) return;
        const d = nearest(lane, it.x);
        if (d > bestD) {
          best = i;
          bestD = d;
        }
      });
      place(it.id, it.x, Math.max(best, 0));
    }
  }
  return { laneOf, laneCnt: Math.max(lanes.length, 1) };
}

/**
 * 레인 간격의 기준 폭 — 360px 화면(갤럭시 기본)의 본문 312px 에서 트랙 안쪽 여백(16 × 2)을 뺀 280px.
 * 위치가 % 라 넓은 화면에선 더 벌어질 뿐 좁아지지 않는다 — 가장 좁은 폭에서 32px 히트 영역이 안 겹치면 된다.
 */
export const TRACK_BASE_W = 280;
/** 손가락 히트 영역(px) */
export const TRACK_HIT = 32;
/** 레인 상한 — 육상 트랙도 8레인이다 */
export const TRACK_MAX_LANES = 8;

export type PbTrackRunner = {
  memId: string;
  memNm: string;
  avatarUrl: string | null;
  /** 게임팀 색 번호 — 러너 테두리(유니폼 색) */
  colorNo: number | null;
  isMe: boolean;
  sec: number;
  basis: string;
  /** 0 = 왼쪽 끝(느림) … 100 = 오른쪽 끝(빠름) */
  x: number;
  /** 0 = 맨 윗레인 */
  lane: number;
};

export type PbTrack = {
  /** 왼쪽 끝(느린 쪽) 초 */
  slowSec: number;
  /** 오른쪽 끝(빠른 쪽) 초 */
  fastSec: number;
  /** 축 눈금(초) — 왼쪽부터 */
  ticks: { sec: number; x: number }[];
  /** 그리는 순서 — 왼쪽(느린 사람)부터, 나는 맨 뒤라 포개져도 맨 위에 그려진다 */
  runners: PbTrackRunner[];
  laneCnt: number;
  /** 트랙에 선 사람들의 중앙값 */
  median: { sec: number; x: number };
  /** 내 목표선 — 목표가 있을 때만 */
  goal: { sec: number; x: number } | null;
  /** 기록이 없어 트랙에 못 선 승인 참가자 수 */
  missingCnt: number;
  /** 그중에 내가 있나 */
  meMissing: boolean;
};

type TrackPrtLike = Pick<PbScoreMember, "memId" | "memNm" | "grpId" | "goalSec" | "recs"> & {
  aprvYn: boolean;
  avatarUrl: string | null;
};

/** 눈금 간격 — 범위가 좁으면 2분, 보통 5분, 30분이 넘게 벌어지면 10분(280px 에 라벨이 7개 넘게 서면 서로 붙는다) */
function trackTickStep(span: number): number {
  if (span <= 12 * 60) return 120;
  return span <= 30 * 60 ? 300 : 600;
}

/**
 * 승인된 참가자 → 트랙. 아무도 기록이 없으면 null(빈 상태가 선다).
 * 입금 대기자는 아직 참가자가 아니라 세지도 않는다(크루 출석·정산과 같은 경계).
 */
export function buildPbTrack(args: {
  participants: readonly TrackPrtLike[];
  rule: Pick<PbRule, "tenKFactor" | "midWkNo">;
  myMemId: string | null;
  colorOfGrp?: ReadonlyMap<string, number | null>;
}): PbTrack | null {
  const { participants, rule, myMemId, colorOfGrp } = args;
  const approved = participants.filter((p) => p.aprvYn);

  const placed: Omit<PbTrackRunner, "x" | "lane">[] = [];
  let missingCnt = 0;
  let meMissing = false;
  for (const p of approved) {
    const pred = predicted10k(p, rule);
    if (!pred) {
      missingCnt += 1;
      if (p.memId === myMemId) meMissing = true;
      continue;
    }
    placed.push({
      memId: p.memId,
      memNm: p.memNm,
      avatarUrl: p.avatarUrl,
      colorNo: p.grpId ? (colorOfGrp?.get(p.grpId) ?? null) : null,
      isMe: p.memId === myMemId,
      sec: pred.sec,
      basis: pred.basis,
    });
  }
  if (placed.length === 0) return null;

  const me = approved.find((p) => p.memId === myMemId);
  const goalSec = me?.goalSec && me.goalSec > 0 ? me.goalSec : null;

  // 범위 = 트랙에 선 사람(+ 내 목표)의 양 끝에서 조금 더 벌려 **분 단위**로 끊는다 — 끝 사람이 가장자리에
  // 붙지 않을 만큼만. 5분 단위로 끊으면 아무도 없는 구간이 트랙의 5분의 1을 먹고, 그만큼 사람들이
  // 좁은 데 몰려 레인이 늘어난다(실측 픽스처: 35~40분이 통째로 비었다).
  const secs = placed.map((r) => r.sec);
  const lo = Math.min(...secs, goalSec ?? Infinity);
  const hi = Math.max(...secs, goalSec ?? -Infinity);
  const pad = Math.max(60, (hi - lo) * 0.08);
  const fastSec = Math.max(0, Math.floor((lo - pad) / 60) * 60);
  const slowSec = Math.ceil((hi + pad) / 60) * 60;
  const span = slowSec - fastSec;
  const xOf = (sec: number) => round1(((slowSec - sec) / span) * 100);

  // 눈금은 범위 안의 딱 떨어지는 시각만(끝값이 49:00 이어도 눈금은 45:00·50:00)
  const step = trackTickStep(span);
  const ticks: PbTrack["ticks"] = [];
  for (let s = Math.floor(slowSec / step) * step; s >= fastSec; s -= step) ticks.push({ sec: s, x: xOf(s) });

  const withX = placed.map((r) => ({ ...r, x: xOf(r.sec) }));
  const { laneOf, laneCnt } = layoutTrackLanes(
    withX.map((r) => ({ id: r.memId, x: r.x, pin: r.isMe })),
    { minGap: (TRACK_HIT / TRACK_BASE_W) * 100, maxLanes: TRACK_MAX_LANES },
  );

  const runners = withX
    .map((r) => ({ ...r, lane: laneOf.get(r.memId) ?? 0 }))
    .sort((a, b) => Number(a.isMe) - Number(b.isMe) || a.x - b.x || a.memNm.localeCompare(b.memNm, "ko"));

  const sorted = [...secs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianSec = Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);

  return {
    slowSec,
    fastSec,
    ticks,
    runners,
    laneCnt,
    median: { sec: medianSec, x: xOf(medianSec) },
    goal: goalSec ? { sec: goalSec, x: xOf(goalSec) } : null,
    missingCnt,
    meMissing,
  };
}

/** 축 눈금 — 분 단위로 딱 떨어지므로 "60:00" / "45:00"(눈금은 짧아야 해서 1시간이 넘어도 시:분:초로 안 바꾼다) */
export function formatTrackTick(sec: number): string {
  return `${Math.round(sec / 60)}:00`;
}
