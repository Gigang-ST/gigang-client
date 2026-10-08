// lib/pb-class-sessions.ts — PB 클래스 공식훈련 벙 「한 번에 열기」의 초안 만들기(순수 계산, next/* 없음)
//
// 관리자가 회차마다 초안(제목·날짜·시간·장소·설명)을 보고 고친 뒤 한 번에 벙으로 연다.
// 기본값은 훈련표(`PbSessPlan`)에서 뽑아 오고, 날짜는 그 주차의 시작일(수요일)이다.
// 주차는 초안이 들고 있는 값을 믿지 않는다 — 서버가 시작 시각에서 다시 계산한다(`weekNoOf`).

import { dayjs } from "@/lib/dayjs";
import type { PbSession } from "@/lib/queries/pb-class";
import { weekNoOf, weekStartDt, wkLabel } from "@/lib/pb-class";
import { PB_TRN_KINDS, type PbSessPlan } from "@/lib/pb-class-plan";

export type PbSessDraft = {
  /** TRAINING 은 1..12, 측정은 그 날짜가 속한 주차(13 또는 14) */
  wkNo: number;
  sessType: "TRAINING" | "MEASURE";
  gthrNm: string;
  /** YYYY-MM-DD (KST) */
  date: string;
  /** HH:mm (KST) */
  time: string;
  durMin: number;
  locTxt: string;
  descTxt: string;
};

export type PbSessDraftDefaults = { time?: string; durMin?: number; locTxt?: string };

export const PB_SESS_DEFAULT_TIME = "19:30";
export const PB_SESS_DEFAULT_DUR_MIN = 90;

/** 설명 맨 끝 줄 — 이 벙이 출석 집계 대상임을 참석자에게 알린다 */
export const PB_SESS_DESC_CLOSING = "겨울 10K PB 클래스 공식훈련 — 이 벙 참석이 출석으로 집계돼요.";

/** 훈련표 한 칸 → 벙 설명. 개인 훈련·첫 10K 줄은 있을 때만 */
export function buildSessDesc(plan: PbSessPlan | null): string {
  const lines: string[] = [];
  if (plan) {
    lines.push(`${PB_TRN_KINDS[plan.kindCd].nm} · ${plan.ttl}`);
    lines.push(`38~50분 그룹: ${plan.mainTxt}`);
    if (plan.easyTxt) lines.push(`첫 10K 그룹: ${plan.easyTxt}`);
    if (plan.selfTxt) lines.push(`개인 훈련: ${plan.selfTxt}`);
    lines.push("");
  }
  lines.push(PB_SESS_DESC_CLOSING);
  return lines.join("\n");
}

/**
 * 아직 벙이 안 걸린 공식훈련 주차(1..총회차−1)의 초안. 측정은 날짜가 미정이라 넣지 않는다(`buildMeasureDraft`).
 * `linkedWkNos`는 삭제된 벙에 걸린 연결도 포함해서 넘긴다 — 주차당 연결은 하나라 그 칸은 이미 차 있다.
 */
export function buildSessDrafts(args: {
  evtSttDt: string;
  totSessCnt: number;
  plans: PbSessPlan[];
  linkedWkNos: number[];
  defaults?: PbSessDraftDefaults;
}): PbSessDraft[] {
  const linked = new Set(args.linkedWkNos);
  const d = args.defaults ?? {};
  const out: PbSessDraft[] = [];
  for (let wk = 1; wk <= args.totSessCnt - 1; wk++) {
    if (linked.has(wk)) continue;
    const plan = args.plans.find((p) => p.sessNo === wk) ?? null;
    out.push({
      wkNo: wk,
      sessType: "TRAINING",
      gthrNm: `PB 클래스 ${wkLabel(wk)}${plan ? ` · ${plan.ttl}` : ""}`,
      date: weekStartDt(args.evtSttDt, wk),
      time: d.time ?? PB_SESS_DEFAULT_TIME,
      durMin: d.durMin ?? PB_SESS_DEFAULT_DUR_MIN,
      locTxt: d.locTxt ?? "",
      descTxt: buildSessDesc(plan),
    });
  }
  return out;
}

/** 측정 벙 초안 — 날짜는 관리자가 정한다. 주차는 그 날짜에서 계산 */
export function buildMeasureDraft(args: {
  evtSttDt: string;
  plans: PbSessPlan[];
  date: string;
  defaults?: PbSessDraftDefaults;
}): PbSessDraft {
  const d = args.defaults ?? {};
  const time = d.time ?? PB_SESS_DEFAULT_TIME;
  // 측정 회차 = 기록 측정(TT) 중 가장 뒤 회차(기본 훈련표의 13회차)
  const plan =
    [...args.plans].filter((p) => p.kindCd === "TT").sort((a, b) => b.sessNo - a.sessNo)[0] ?? null;
  const startIso = dayjs.tz(`${args.date} ${time}`, "Asia/Seoul").toISOString();
  return {
    wkNo: weekNoOf(startIso, args.evtSttDt),
    sessType: "MEASURE",
    gthrNm: "PB 클래스 10K 기록 측정",
    date: args.date,
    time,
    durMin: d.durMin ?? PB_SESS_DEFAULT_DUR_MIN,
    locTxt: d.locTxt ?? "",
    descTxt: buildSessDesc(plan),
  };
}

/**
 * 측정 벙 날짜의 자리표시자 — 마지막 훈련 주차 다음 주 수요일.
 * 측정일은 오너가 정하는 값이라 정답이 아니다. 비워 두면 주차 계산이 안 돼 초안을 못 만들어서 가까운 날을 채워 둘 뿐이다.
 */
export function measurePlaceholderDate(evtSttDt: string, totSessCnt: number): string {
  return weekStartDt(evtSttDt, totSessCnt);
}

/**
 * 기본 장소 = 이미 걸린 PB 벙 중 시작이 가장 늦은 것의 장소.
 * 수요일 정기런 장소가 주마다 옮겨 다녀서(prd 실측) 고정값을 못 박지 않고, 직전 장소를 이어 받는다.
 * 장소가 비어 있는 벙은 건너뛴다 — 그 뒤에 장소가 있는 벙이 있으면 그걸 쓴다. 없으면 "".
 */
export function pickDefaultPlace(sessions: readonly { sttAt: string; locTxt: string | null }[]): string {
  // 문자열 비교 대신 절대시각으로 — DB가 `+00:00`·`Z` 어느 표기로 줘도 순서가 같다
  const sorted = [...sessions].sort((a, b) => dayjs(b.sttAt).valueOf() - dayjs(a.sttAt).valueOf());
  for (const s of sorted) {
    const loc = s.locTxt?.trim();
    if (loc) return loc;
  }
  return "";
}

/** 초안의 시작 시각(KST 날짜+시간) → UTC ISO */
export function draftStartIso(d: Pick<PbSessDraft, "date" | "time">): string {
  return dayjs.tz(`${d.date} ${d.time}`, "Asia/Seoul").toISOString();
}

/** 초안의 종료 시각 = 시작 + durMin분 (절대시각 덧셈이라 타임존 무관) */
export function draftEndIso(d: Pick<PbSessDraft, "date" | "time" | "durMin">): string {
  return dayjs(draftStartIso(d)).add(d.durMin, "minute").toISOString();
}

/** 주차 하나만 여는 창의 대상 — 훈련은 주차, 측정은 한 칸뿐이라 wkNo 를 안 쓴다 */
export type SessOpenOnly = { sessType: "TRAINING"; wkNo: number } | { sessType: "MEASURE" };


/**
 * 회차 탭 목록 한 칸 — 연결된 벙이거나, 아직 벙이 없는 자리(여기서 바로 연다).
 * 순서는 1..총훈련주차, 그 뒤 나머지(측정 등), 측정이 없으면 맨 끝에 측정 자리.
 * 삭제된 벙에 걸린 주차도 `linked`다 — 주차당 연결 1개라 그 칸은 이미 차 있고 서버도 거절한다.
 */
export type SessSlot = { kind: "linked"; session: PbSession } | { kind: "open"; key: string; only: SessOpenOnly };

export function buildSessSlots(sessions: readonly PbSession[], trainingTotal: number): SessSlot[] {
  const out: SessSlot[] = [];
  const used = new Set<PbSession>();
  for (let wk = 1; wk <= trainingTotal; wk++) {
    const linked = sessions.filter((s) => s.sessType === "TRAINING" && s.wkNo === wk);
    if (linked.length === 0) {
      out.push({ kind: "open", key: `open:${wk}`, only: { sessType: "TRAINING", wkNo: wk } });
      continue;
    }
    for (const s of linked) {
      used.add(s);
      out.push({ kind: "linked", session: s });
    }
  }
  for (const s of sessions) if (!used.has(s)) out.push({ kind: "linked", session: s });
  if (!sessions.some((s) => s.sessType === "MEASURE")) {
    out.push({ kind: "open", key: "open:measure", only: { sessType: "MEASURE" } });
  }
  return out;
}
