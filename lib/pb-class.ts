// lib/pb-class.ts — 겨울 10K PB 클래스(출석 기반 프로젝트) 순수 계산 코어
//
// 마일리지런이 「각자 뛴 거리」로 환급했다면 PB 클래스는 「공식훈련에 나온 횟수」로 환급한다.
// 금전이 걸린 계산이라 **화면·관리자·MCP가 전부 이 파일 하나를 부른다**(복사 금지 —
// 한쪽만 고쳐지는 날 사람 돈이 어긋난다. lib/mileage-run.ts 와 같은 이유).
//
// 규칙 정본: GitHub #577 본문 + 보강 댓글(2026-10-07 오너 확정).

import { formatKST, parseEventTime } from "@/lib/dayjs";

/** evt_team_mst.evt_type_cd 값 */
export const PB_CLASS_TYPE = "PB_CLASS";

/** evt_gthr_rel.sess_type_cd — 공식훈련 / 10K TT 측정 */
export const PB_SESS_TYPES = ["TRAINING", "MEASURE"] as const;
export type PbSessType = (typeof PB_SESS_TYPES)[number];

export const PB_SESS_TYPE_LABEL: Record<PbSessType, string> = {
  TRAINING: "공식훈련",
  MEASURE: "10K 측정",
};

/** 프로젝트별 설정(evt_pb_cfg). 숫자는 전부 관리자 설정값이고 아래는 기본값이다. */
export type PbClassCfg = {
  /** 보증금 출석 총 회차 — 공식훈련 12 + 측정 1 */
  totSessCnt: number;
  /** 정식 참가자의 전액 환급 기준 출석 수 */
  fullRfndAttdCnt: number;
  /** 이 주차부터 합류하면 보증금 없이 참가비만 낸다(환급·팀전 없음) */
  lateJoinWkNo: number;
  /** 정식·W2~W5 합류자의 보증금 */
  depositAmt: number;
  /** 참가비(돌려주지 않는다) */
  entryFeeAmt: number;
  /** 마일리지런에 참가했던 사람의 참가비 할인액(오너 지시 2026-10-07, 보증금 → 참가비 2026-10-08) */
  mlgDcAmt: number;
};

export const PB_CLASS_DEFAULT_CFG: PbClassCfg = {
  totSessCnt: 13,
  fullRfndAttdCnt: 9,
  lateJoinWkNo: 6,
  depositAmt: 30_000,
  entryFeeAmt: 10_000,
  mlgDcAmt: 5_000,
};

/**
 * 시각(벙 `stt_at`) → 프로젝트 주차. W1 = 프로젝트 `stt_dt`(수요일) 00:00 KST부터 7일.
 *
 * 주 경계는 「수요일 00:00 ~ 화요일 23:59 KST」(#577 리뷰 답변 4번)인데, 그건 `stt_dt`를
 * 수요일로 잡으면 저절로 따라온다 — 요일을 여기서 따로 박지 않는다.
 * 날짜 개념이 끼는 계산이라 **양쪽 다 KST 자정**으로 맞춘다(AGENTS.md §날짜).
 * W1 이전이면 0 이하가 나온다(호출부가 거른다).
 */
export function weekNoOf(sttAt: string, evtSttDt: string): number {
  const day = parseEventTime(formatKST(sttAt, "YYYY-MM-DD"));
  const w1 = parseEventTime(evtSttDt);
  return Math.floor(day.diff(w1, "day") / 7) + 1;
}

/** 오늘(KST) 기준 주차 — 합류 주차 기본값에 쓴다 */
export function currentWeekNo(evtSttDt: string, nowIso: string): number {
  return Math.max(1, weekNoOf(nowIso, evtSttDt));
}

/** 이 주차에 합류하면 늦은 합류(보증금 없음·환급 없음·팀전 제외)인가 */
export function isLateJoin(joinWkNo: number, cfg: PbClassCfg): boolean {
  return joinWkNo >= cfg.lateJoinWkNo;
}

/**
 * 합류 시점에 남은 회차(측정일 포함).
 *
 * **연결된 벙 수를 세지 않고 산술로 낸다.** 한파로 취소된 회차의 벙을 지우거나 연결을
 * 빼도 합류자의 환급 기준이 조용히 바뀌지 않게 — 「분모를 바꾸지 않는다」(#577 한파 규칙).
 * 회차 i는 i주차(공식훈련 1~12)이고 측정은 마지막 회차라, W n 합류자는 앞의 n-1회만 놓친다.
 */
export function remainingSessCnt(joinWkNo: number, cfg: PbClassCfg): number {
  const missed = Math.max(0, joinWkNo - 1);
  return Math.max(0, cfg.totSessCnt - missed);
}

/**
 * 전액 환급 기준 출석 수 = floor(남은 회차 × 전액기준 ÷ 총회차).
 * 정식 참가자(W1)는 13 → 9 그대로, W2 8 · W3 7 · W4 6 · W5 6. 늦은 합류면 null(환급 없음).
 *
 * 내림인 이유: 올림이면 W2 합류자가 한 회차를 놓치고도 정식 참가자와 같은 9회를
 * 채워야 해서 오히려 손해다(#577 리뷰 7번).
 */
export function requiredAttdCnt(joinWkNo: number, cfg: PbClassCfg): number | null {
  if (isLateJoin(joinWkNo, cfg)) return null;
  const req = Math.floor((remainingSessCnt(joinWkNo, cfg) * cfg.fullRfndAttdCnt) / cfg.totSessCnt);
  return req > 0 ? req : null;
}

/** 공식훈련·측정으로 지정된 벙 한 건 */
export type PbSessLink = {
  gthrId: string;
  wkNo: number;
  sessType: PbSessType;
  /**
   * 이미 열린 회차인가 = 삭제 안 됨 && 시작 시각이 지남. 호출부가 `isSessHeld`로 채운다.
   * `gthr_attd_rel`은 **미래 벙의 참석 예약까지** 담는 테이블이라(행 = 참석 확정), 시작 전 벙을
   * 세면 아직 안 간 회차가 출석으로 잡힌다. 삭제된 벙(한파 취소)은 전원 불참이다.
   */
  held: boolean;
};

/** 벙이 이미 열렸는가 — 절대시각 비교라 타임존 무관 */
export function isSessHeld(gthr: { stt_at: string; del_yn: boolean }, nowIso: string): boolean {
  return !gthr.del_yn && parseEventTime(gthr.stt_at).valueOf() <= parseEventTime(nowIso).valueOf();
}

/**
 * 보증금 출석 수 — 지정된 벙 중 **이미 열렸고 합류 주차 이후**인 것의 참석만 센다.
 * 합류 전 주차는 그 사람에 대해 환급 출석·점수 모두 계산하지 않는다(#577 리뷰 6번).
 */
export function countAttd(
  links: readonly PbSessLink[],
  attendedGthrIds: ReadonlySet<string>,
  joinWkNo: number,
): number {
  let n = 0;
  for (const l of links) {
    if (l.held && l.wkNo >= joinWkNo && attendedGthrIds.has(l.gthrId)) n += 1;
  }
  return n;
}

/**
 * 환급액 = 보증금 × min(출석, 기준) ÷ 기준. 원 단위 내림.
 * 보증금은 **참가자 행의 `deposit_amt`**를 쓴다 — 늦은 합류자는 0이라 저절로 0원이 된다.
 */
export function refundAmt(depositAmt: number, attdCnt: number, required: number | null): number {
  if (!required || depositAmt <= 0) return 0;
  return Math.floor((depositAmt * Math.min(attdCnt, required)) / required);
}

export type PbRefundSummary = {
  joinWkNo: number;
  late: boolean;
  attdCnt: number;
  required: number | null;
  /** 전액까지 남은 출석 수(늦은 합류면 null) */
  toFull: number | null;
  refund: number;
  /** 돌려주지 않는 보증금(회식비·대회 참가비 풀) */
  unrefunded: number;
};

/** 한 참가자의 출석·환급 요약 — 회원 화면과 관리자 표가 같은 값을 보게 한 곳에서 낸다 */
export function summarizeRefund(args: {
  joinWkNo: number;
  depositAmt: number;
  links: readonly PbSessLink[];
  attendedGthrIds: ReadonlySet<string>;
  cfg: PbClassCfg;
}): PbRefundSummary {
  const { joinWkNo, depositAmt, links, attendedGthrIds, cfg } = args;
  const late = isLateJoin(joinWkNo, cfg);
  const attdCnt = countAttd(links, attendedGthrIds, joinWkNo);
  const required = requiredAttdCnt(joinWkNo, cfg);
  const refund = refundAmt(depositAmt, attdCnt, required);
  return {
    joinWkNo,
    late,
    attdCnt,
    required,
    toFull: required === null ? null : Math.max(0, required - attdCnt),
    refund,
    unrefunded: Math.max(0, depositAmt - refund),
  };
}

/** 회차 띠 한 칸의 상태 */
export type PbStripState =
  | "attended" // 출석
  | "missed" // 열렸는데 안 나옴
  | "upcoming" // 아직 안 열림
  | "canceled" // 연결된 벙이 삭제됨(한파 취소 — 전원 불참)
  | "unlinked" // 운영진이 아직 벙을 지정하지 않음
  | "before_join"; // 합류 전 주차 — 이 사람에겐 세지 않는다

export type PbStripCell = {
  /** "1주차" … "12주차" / "측정" */
  label: string;
  sessType: PbSessType;
  wkNo: number | null;
  gthrId: string | null;
  state: PbStripState;
};

/**
 * 회원 화면의 회차 띠 — 공식훈련 (총회차-1)칸 + 측정 1칸.
 *
 * 훈련 칸은 **주차로** 줄을 세운다(W1~W12 고정). 측정은 W13이든 W14든 마지막 한 칸이다 —
 * `wk_no`는 주차이지 회차가 아니라서, 측정을 W14에 하면 13번째 칸이 14주차에 놓인다.
 */
export function buildSessStrip(args: {
  links: readonly (PbSessLink & { delYn: boolean })[];
  attendedGthrIds: ReadonlySet<string>;
  joinWkNo: number;
  cfg: PbClassCfg;
}): PbStripCell[] {
  const { links, attendedGthrIds, joinWkNo, cfg } = args;
  const stateOf = (link: (PbSessLink & { delYn: boolean }) | undefined, wkNo: number | null): PbStripState => {
    if (wkNo !== null && wkNo < joinWkNo) return "before_join";
    if (!link) return "unlinked";
    if (link.delYn) return "canceled";
    if (!link.held) return "upcoming";
    return attendedGthrIds.has(link.gthrId) ? "attended" : "missed";
  };

  const cells: PbStripCell[] = [];
  const trainingWeeks = Math.max(0, cfg.totSessCnt - 1);
  for (let wk = 1; wk <= trainingWeeks; wk += 1) {
    const link = links.find((l) => l.sessType === "TRAINING" && l.wkNo === wk);
    cells.push({
      label: wkLabel(wk),
      sessType: "TRAINING",
      wkNo: wk,
      gthrId: link?.gthrId ?? null,
      state: stateOf(link, wk),
    });
  }
  const measure = links.find((l) => l.sessType === "MEASURE");
  cells.push({
    label: "측정",
    sessType: "MEASURE",
    wkNo: measure?.wkNo ?? null,
    gthrId: measure?.gthrId ?? null,
    state: stateOf(measure, measure?.wkNo ?? null),
  });
  return cells;
}

/** 합류 주차에 맞는 납부액 — 늦은 합류면 보증금 0 */
export function feesForJoinWeek(
  joinWkNo: number,
  cfg: PbClassCfg,
  opts: { mlgAlumni?: boolean } = {},
): { depositAmt: number; entryFeeAmt: number; entryFeeDcAmt: number } {
  // 마일리지런 참가자는 **참가비**에서 깎는다(오너 2026-10-08 — 보증금이 아니다). 보증금은 누구나 같아서
  // 환급 표도 하나다. 참가비는 늦은 합류자도 내므로 할인도 똑같이 받는다. 참가비보다 크게는 못 깎는다.
  const dc = opts.mlgAlumni ? Math.min(cfg.mlgDcAmt, cfg.entryFeeAmt) : 0;
  return {
    depositAmt: isLateJoin(joinWkNo, cfg) ? 0 : cfg.depositAmt,
    entryFeeAmt: cfg.entryFeeAmt - dc,
    entryFeeDcAmt: dc,
  };
}

/**
 * 프로젝트 종료일 = 시작일(W1 수요일) + (총회차 + 1)주 − 1일.
 * 공식훈련 (총회차−1)주 + 측정이 W13·W14 중 하루라 측정 주간 끝까지 덮는다(11/4 시작이면 2/9 화).
 * 관리자가 손으로 넣으면 W12 날짜로 끊어 측정 벙 연결이 막히는 일이 실제로 있었다 — 그래서 계산으로 정한다.
 */
export function pbEndDtFor(evtSttDt: string, cfg: PbClassCfg): string {
  return parseEventTime(evtSttDt)
    .add((cfg.totSessCnt + 1) * 7 - 1, "day")
    .format("YYYY-MM-DD");
}

/** n주차가 시작하는 날(수요일) — 훈련표·띠에 날짜를 찍을 때 */
export function weekStartDt(evtSttDt: string, wkNo: number): string {
  return parseEventTime(evtSttDt).add((wkNo - 1) * 7, "day").format("YYYY-MM-DD");
}

/** 화면 표기 — 「W9」가 아니라 「9주차」(오너 지시). 측정은 주차가 아니라 「측정」 */
export function wkLabel(wkNo: number): string {
  return `${wkNo}주차`;
}
