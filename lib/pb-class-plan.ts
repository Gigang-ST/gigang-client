// lib/pb-class-plan.ts — PB 클래스 회차별 훈련표 기본값 · 훈련 종류 사전 · 내 훈련 페이스(P) 계산
//
// 훈련 내용은 2026-10-08 오너가 「조사 수정안」으로 골랐다(다니엘스·맥밀런·히그던·테이퍼 메타분석 —
// `docs/design/2026-10-08-pb-훈련표-선택.html`). 앱에서는 프로젝트마다 `evt_pb_sess_plan`에 들어가고
// (진행중으로 열 때 자동, 관리자가 고칠 수 있다), 아래는 그 기본값이다.
//
// 표기 원칙(오너): 속도는 짧게 `P±초`, 쉬는 법·시간은 반복마다 빠짐없이, 「크루즈」 같은 모르는 용어는 안 쓴다.
// 회차마다 「단계」 대신 **훈련 종류**(역치·VO2max…)를 단다 — 목적 문장은 다 "10K 단축"으로 읽혀서,
// 종류 이름과 그 종류가 기르는 것 한 줄(`PB_TRN_KINDS`)이 대신한다.

/** 훈련 종류 코드 — evt_pb_sess_plan.trn_kind_cd */
export const PB_TRN_KIND_CDS = ["TT", "SPD", "HILL", "THR", "VO2", "RACE", "FART", "TAPER"] as const;
export type PbTrnKindCd = (typeof PB_TRN_KIND_CDS)[number];

/** 훈련 종류 사전 — 다니엘스 구간(T·I·R)과 10K 플랜의 통상 이름. 속도는 P 기준 */
export const PB_TRN_KINDS: Record<PbTrnKindCd, { nm: string; pace: string; what: string }> = {
  TT: { nm: "기록 측정", pace: "최선", what: "지금 실력 확인 — 내 P·훈련팀·목표를 정하는 기준" },
  SPD: { nm: "스피드 훈련", pace: "P-15초 이상, 짧게", what: "다리 회전·주법 — 같은 속도를 덜 힘들게" },
  HILL: { nm: "업힐 훈련", pace: "힘 있게", what: "다리 근력과 자세 — 평지 인터벌보다 부상 부담이 적다" },
  THR: { nm: "역치 훈련", pace: "P+5~15초", what: "숨이 차기 직전 속도를 오래 버티는 힘(젖산역치)" },
  VO2: { nm: "VO2max 훈련", pace: "P-10~15초", what: "심폐 최대치 — 높아지면 목표 페이스가 상대적으로 편해진다" },
  RACE: { nm: "레이스 페이스 훈련", pace: "정확히 P", what: "목표 속도 감각과 레이스 지구력" },
  FART: { nm: "파틀렉", pace: "빠르게 ↔ 조깅", what: "속도 전환 적응 — 고강도 입문" },
  TAPER: { nm: "테이퍼", pace: "P, 양만 줄임", what: "피로 빼기 — 강도는 유지하고 양을 40~60% 줄인다" },
};

/** 회차 하나의 훈련 — sess_no 1~12는 그 주차 공식훈련, 13은 10K 측정 */
export type PbSessPlan = {
  sessNo: number;
  /** 훈련 종류 — 화면은 `PB_TRN_KINDS[kindCd]`로 이름·속도·기르는 것을 그린다 */
  kindCd: PbTrnKindCd;
  /** 제목 한 줄 */
  ttl: string;
  /** 38~50분 그룹 세션 */
  mainTxt: string;
  /** 첫 10K 그룹 세션 — 같은 세션을 개수만 줄인다. 없으면 다른 그룹과 같음 */
  easyTxt: string | null;
  /** 개인 훈련 안내(그 주 공식훈련 밖에서 각자) — 읽기만 하는 글, 체크·기록 없음 */
  selfTxt: string | null;
  /** 비고(행사·주의사항 등) */
  noteTxt: string | null;
};

/** 개인 훈련 한 줄 — 장거리 거리는 「38~45분 / 50분·첫 10K」 두 갈래로 적는다 */
const self = (base: string, long: string, extra?: string) =>
  `${base} · 장거리 1회 ${long}${extra ? ` · ${extra}` : ""}`;

export const PB_DEFAULT_SESS_PLANS: PbSessPlan[] = [
  {
    sessNo: 1,
    kindCd: "TT",
    ttl: "킥오프 + 5K 기록 측정",
    mainTxt: "워밍업 15분 + 드릴 → 5K 최선",
    easyTxt: null,
    selfTxt: self("이지런 2회", "38~45분 12km / 50분·첫 10K 8km", "측정 다음 날은 쉬거나 20분 조깅"),
    noteTxt: "기준기록 → 내 P·훈련팀·목표",
  },
  {
    sessNo: 2,
    kindCd: "FART",
    ttl: "파틀렉 24분 + 스트라이드",
    mainTxt: "1분 @ P-10초 ↔ 1분 조깅, 24분 → 스트라이드 20초 × 4",
    easyTxt: "20분",
    selfTxt: self("이지런 2~3회 · 스트라이드 20초 × 4 주 2회", "12km / 8km"),
    noteTxt: "게임팀 발표",
  },
  {
    sessNo: 3,
    kindCd: "HILL",
    ttl: "업힐 반복",
    mainTxt: "오르막 60~75초 → 내려오며 조깅 · 6~8회",
    easyTxt: "5~6회",
    selfTxt: self("이지런 2~3회 · 스트라이드 주 2회", "13km / 9km"),
    noteTxt: "장소 이동",
  },
  {
    sessNo: 4,
    kindCd: "SPD",
    ttl: "400m 반복",
    mainTxt: "400m @ P-15초 → 200m 조깅 · 8회",
    easyTxt: "6회",
    selfTxt: self("이지런 2~3회 · 스트라이드 주 2회", "13km / 9km"),
    noteTxt: null,
  },
  {
    sessNo: 5,
    kindCd: "THR",
    ttl: "템포런 20분",
    mainTxt: "20분 @ P+10~15초 연속",
    easyTxt: "15분",
    selfTxt: self("이지런 2~3회 · 스트라이드 주 2회", "14km / 10km"),
    noteTxt: null,
  },
  {
    sessNo: 6,
    kindCd: "TT",
    ttl: "5K 기록 측정 (중간점검)",
    mainTxt: "워밍업 15분 + 드릴 → 5K 최선",
    easyTxt: null,
    selfTxt: self("이지런 2회", "12km / 8km", "측정 주라 조금 줄여요"),
    noteTxt: "내 P·훈련팀 다시 맞추기 · 향상 점수",
  },
  {
    sessNo: 7,
    kindCd: "VO2",
    ttl: "800m 반복",
    mainTxt: "800m @ P-10~15초 → 2분 조깅 · 6회",
    easyTxt: "4회",
    selfTxt: self("이지런 2~3회 · 스트라이드 주 2회", "14km / 10km", "40분 이하는 장거리 마지막 3km를 P로"),
    noteTxt: null,
  },
  {
    sessNo: 8,
    kindCd: "THR",
    ttl: "템포런 12분 × 2",
    mainTxt: "12분 @ P+5~10초 → 2분 조깅 → 12분",
    easyTxt: "10분 → 2분 조깅 → 10분",
    selfTxt: self("이지런 2~3회", "15km / 11km", "연말 일정에 맞춰 줄여도 괜찮아요"),
    noteTxt: "연말 주간",
  },
  {
    sessNo: 9,
    kindCd: "VO2",
    ttl: "1km 반복",
    mainTxt: "1km @ P-10~15초 → 2분30초 조깅 · 5회",
    easyTxt: "4회",
    selfTxt: self("이지런 2~3회 · 스트라이드 주 2회", "15km / 11km", "40분 이하는 장거리 마지막 4km를 P로"),
    noteTxt: "올해 마지막 런",
  },
  {
    sessNo: 10,
    kindCd: "RACE",
    ttl: "2km 반복",
    mainTxt: "2km @ P → 3분 조깅 · 3회",
    easyTxt: "2회",
    selfTxt: self("이지런 2~3회 · 스트라이드 주 2회", "16km / 12km"),
    noteTxt: null,
  },
  {
    sessNo: 11,
    kindCd: "RACE",
    ttl: "3km 반복",
    mainTxt: "3km @ P → 4분 조깅 · 2회 (38분 이하는 3회)",
    easyTxt: "2.5km × 2",
    selfTxt: self("이지런 2~3회 · 스트라이드 주 2회", "16km / 13km", "40분 이하는 장거리 마지막 4km를 P로"),
    noteTxt: "12주의 정점 세션",
  },
  {
    sessNo: 12,
    kindCd: "TAPER",
    ttl: "짧은 레이스 페이스 + 스트라이드",
    mainTxt: "1km @ P → 2분 조깅 · 3회 → 스트라이드 20초 × 4",
    easyTxt: "1km × 2",
    selfTxt: self("이지런 2회 · 스트라이드 주 2회", "12km / 9km", "양을 40~60% 줄여 피로 빼기"),
    noteTxt: "마지막 공식훈련 · 장비·워밍업 리허설",
  },
  {
    sessNo: 13,
    kindCd: "TT",
    ttl: "10K 기록 측정",
    mainTxt: "워밍업 15분 + 드릴 → 10K 최선",
    easyTxt: null,
    selfTxt: "측정 전 이틀은 쉬거나 20분 조깅 · 측정 뒤엔 회복 조깅만",
    noteTxt: "13번째 회차 · 보증금 출석 포함 · 날짜는 추후 일정",
  },
];

/** 훈련표 머리말 — 모든 세션에 공통으로 붙는 것 */
export const PB_PLAN_NOTES = [
  "P = 내 훈련 페이스. 기본은 10K 목표 ÷ 10이고, 1·6주차 5K 기록으로 환산한 10K 페이스(5K × 2.085 ÷ 10)가 더 느리면 그걸 써요.",
  "조깅 = 대화할 수 있는 편한 속도 (P보다 km당 1:30~2:00 느리게).",
  "스트라이드 = 20초 동안 빠르게 가속했다가 걷듯이 회복 — 폼 연습이에요.",
  "모든 세션은 앞뒤로 워밍업 2~3km + 드릴, 쿨다운 1~2km를 붙여요.",
  "개인 훈련은 안내예요 — 출석으로 인정하지 않아요.",
];

// ─────────────────────────────────────────
// 내 훈련 페이스(P) — 측정 기록 기준(오너 결정 2026-10-08)
// ─────────────────────────────────────────

/** 5K → 10K 환산 계수(Riegel 1.06) — 점수 규칙 기본값(`PB_DEFAULT_RULE.tenKFactor`)과 같은 값 */
const TEN_K_FACTOR = 2.085;

export type PbTrainingPace = {
  /** km당 초 */
  sec: number;
  /**
   * 그 P의 10K 시간(초, **반올림 전**) — 훈련팀 자동 배정(`autoTrnGrpCd`)의 기준.
   * `sec × 10`으로 되돌리면 안 된다: km당 초를 반올림한 뒤라 10초 단위로 뭉개져, 목표 38:04가 「38분 이하」로 들어간다.
   */
  tenKSec: number;
  /** 무엇으로 정했나 */
  basis: "goal" | "record";
  /** 기록 기준이면 어느 측정에서 왔나 */
  recLabel: string | null;
};

/**
 * 내 P = 목표 페이스(10K 목표 ÷ 10)와 **가장 최근 5K 측정으로 환산한 10K 페이스** 중 **느린 쪽**.
 * 목표보다 한참 느린 사람이 목표 페이스로 인터벌을 뛰면 과부하가 된다(다니엘스 — 훈련 페이스는 현재 기록으로).
 * 둘 다 없으면 null(화면은 훈련팀의 대회 페이스로 물러난다).
 */
export function trainingPace(args: {
  goalSec: number | null;
  base5kSec: number | null;
  mid5kSec: number | null;
  /** 중간점검 주차 — 설정값(`rule.midWkNo`). 화면 문구 「N주차 5K」에 쓴다 */
  midWkNo?: number;
}): PbTrainingPace | null {
  // 비교는 10K 시간으로 한다 — km당으로 나눈 뒤 비교해도 순서는 같지만, 훈련팀 경계(38:00 등)가 10K 시간이라서
  const goal = args.goalSec && args.goalSec > 0 ? args.goalSec : null;
  const latest = args.mid5kSec ?? args.base5kSec;
  const rec = latest && latest > 0 ? latest * TEN_K_FACTOR : null;
  const recLabel = args.mid5kSec ? `${args.midWkNo ?? 6}주차 5K` : args.base5kSec ? "1주차 5K" : null;
  if (goal === null && rec === null) return null;
  if (rec !== null && (goal === null || rec > goal)) {
    return { sec: Math.round(rec / 10), tenKSec: rec, basis: "record", recLabel };
  }
  const g = goal as number;
  return { sec: Math.round(g / 10), tenKSec: g, basis: "goal", recLabel: null };
}

/** km당 초 → "4:38" */
export function fmtPace(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * 훈련 문구의 `P±N초`·`P±N~M초`·맨 `P` 옆에 내 실제 페이스를 붙인다 —
 * "400m @ P-15초" → "400m @ P-15초(4:23)". 문구는 그대로 두고 괄호만 덧붙여, 같은 훈련표를 보는
 * 사람마다 자기 숫자를 본다. 「P(」처럼 이미 붙은 곳은 건드리지 않는다.
 */
export function withMyPace(txt: string, pSec: number | null): string {
  if (pSec === null) return txt;
  return txt.replace(/P([+-])(\d+)(?:~(\d+))?초|P(?=[\s,)·]|$)/g, (m: string, sign?: string, a?: string, b?: string) => {
    if (!sign) return `P(${fmtPace(pSec)})`;
    const shift = (n: string) => pSec + (sign === "+" ? 1 : -1) * Number(n);
    const lo = shift(a as string);
    if (!b) return `${m}(${fmtPace(lo)})`;
    const hi = shift(b);
    return `${m}(${fmtPace(Math.min(lo, hi))}~${fmtPace(Math.max(lo, hi))})`;
  });
}

/**
 * 훈련팀 — **목표 시간으로 부른다**(오너 지시 2026-10-07: "트레이닝그룹 ABCD는 목표 시간으로 불러라").
 * A~E는 DB(`evt_pb_prt_rel.trn_grp_cd`)에 남는 내부 코드일 뿐, 화면엔 `nm`이 나간다.
 * 안내엔 10K 목표기록과 대회 페이스만 적는다(주간거리는 걷었다).
 */
export type PbTrnGroup = {
  /** 내부 코드 — trn_grp_cd */
  cd: string;
  /** 화면 이름 */
  nm: string;
  /** 10K 목표기록 상한(초) */
  goalSec: number;
  /** 대회 페이스(목표기록 ÷ 10) */
  paceTxt: string;
};

export const PB_TRN_GROUPS: PbTrnGroup[] = [
  { cd: "A", nm: "38분 이하", goalSec: 38 * 60, paceTxt: "3:48/km" },
  { cd: "B", nm: "40분 이하", goalSec: 40 * 60, paceTxt: "4:00/km" },
  { cd: "C", nm: "45분 이하", goalSec: 45 * 60, paceTxt: "4:30/km" },
  { cd: "D", nm: "50분 이하", goalSec: 50 * 60, paceTxt: "5:00/km" },
  { cd: "E", nm: "첫 10K · 60분 이하", goalSec: 60 * 60, paceTxt: "6:00/km" },
];

/** 훈련팀 코드 → 화면 이름. 목록에 없는 코드(운영진이 D1·D2처럼 쪼갠 경우)는 코드 그대로 */
export function trnGroupNm(cd: string | null | undefined): string | null {
  if (!cd) return null;
  return PB_TRN_GROUPS.find((g) => g.cd === cd)?.nm ?? cd;
}

/** 목표 시간 짧은 순 — 자동 배정은 「상한이 내 10K 이상인 첫 칸」을 찾으므로 순서가 곧 규칙이다 */
const TRN_GROUPS_BY_LIMIT = [...PB_TRN_GROUPS].sort((a, b) => a.goalSec - b.goalSec);

/**
 * 훈련팀 자동 배정 — 내 P의 10K 시간이 들어가는 칸(오너 2026-10-08: 「기록 입력하면 알아서 abcd 들어가게」).
 *
 * 상한이 그 시간 이상인 첫 칸이고, 가장 느린 칸(첫 10K)보다도 느리면 그 칸에 남긴다 — 한 시간 넘게 걸리는 사람을
 * 「팀 없음」으로 두면 훈련표가 아무 줄도 짚지 못한다. P가 없으면(목표도 5K 기록도 없음) null = 아직 안 정해짐.
 * 기준이 P라서 훈련 탭의 「내 P」와 팀이 늘 같은 숫자에서 나온다 — 중간점검 기록이 오르면 팀도 따라 옮긴다.
 *
 * DB `trn_grp_cd`는 이 값을 저장하지 않는다. 거기 든 값은 **운영진이 고정한 팀**이고(null = 자동),
 * 실제 팀은 `고정 ?? 자동`이다(`lib/queries/pb-class-game.ts`). 저장하면 기록이 바뀔 때마다 다시 써야 한다.
 */
export function autoTrnGrpCd(pace: Pick<PbTrainingPace, "tenKSec"> | null): string | null {
  if (!pace) return null;
  const slowest = TRN_GROUPS_BY_LIMIT[TRN_GROUPS_BY_LIMIT.length - 1];
  return (TRN_GROUPS_BY_LIMIT.find((g) => pace.tenKSec <= g.goalSec) ?? slowest).cd;
}

/** 첫 10K 그룹인가 — 훈련표에서 E 세션을 먼저 보여 줄지 */
export const PB_FIRST_10K_GROUP_CD = "E";
