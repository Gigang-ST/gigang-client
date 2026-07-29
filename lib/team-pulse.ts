import { dayjs } from "@/lib/dayjs";

import type { MoodLevel } from "@/lib/mood-scale";
import type { TeamWeek } from "@/lib/queries/team-overview";

/** 그 달의 몇째 주인지 (1~5). 주 시작일(월요일)이 속한 달·날짜 기준으로 단순 계산 */
const ORDINAL = ["", "첫째", "둘째", "셋째", "넷째", "다섯째"];

/**
 * 주 시작일(YYYY-MM-DD) → "6월 첫째주" 라벨.
 *
 * "6월 1일주 / 8일주"처럼 시작일 숫자를 그대로 읽던 것을 사람이 쓰는 말로 바꾼다.
 * 몇째 주는 날짜 기반(1~7일=첫째, 8~14일=둘째 …)으로 센다 — 주 시작일이 그 달 며칠인지만 보면 돼
 * 직관적이고, 달을 걸치는 주는 시작일이 속한 달 기준으로 잡힌다.
 */
export function formatWeekLabel(wStart: string): string {
  const d = dayjs(wStart);
  const nth = Math.min(5, Math.floor((d.date() - 1) / 7) + 1);
  return `${d.month() + 1}월 ${ORDINAL[nth]}주`;
}

/** 팀 활동 지수 결과 — 단어(label)·멘트(message)·심박수(bpm)를 함께 담는다 */
export type TeamPulse = {
  level: MoodLevel;
  /** 러닝 페이스/존 은유 라벨 — Team Pulse 전용 어휘(TEAM_PULSE_SCALE) */
  label: string;
  /** 지금 크루 분위기를 러닝 톤으로. ratio·근거 수치를 다시 읽어주지 않는다 */
  message: string;
  /** 심박수(BPM) — ratio를 연속 매핑한 값. 50~200 */
  bpm: number;
};

/**
 * Team Pulse 전용 4단계 라벨+멘트. 개인 프로필 카드의 컨디션(`MOOD_SCALE`)과는 더 이상 어휘를
 * 공유하지 않는다 — 저쪽은 개인 활동 건수를 담담히 말하고, 여기는 BPM/심전도 그래픽에 맞춰
 * 러닝 페이스·존 은유로 지금 크루가 얼마나 활발한지를 표현한다. 단계 키(`MoodLevel`)만
 * 재사용하고 텍스트는 이 표 하나에만 둔다.
 */
const TEAM_PULSE_SCALE: Record<MoodLevel, { label: string; message: string }> = {
  blazing: { label: "심장 폭발", message: "인터벌 훈련을 고강도로 운동 중이에요" },
  steady: { label: "꾸준한 페이스", message: "다들 꾸준한 페이스로 달리고 있어요" },
  resting: { label: "가벼운 조깅", message: "다들 가볍게 몸을 풀고 있어요" },
  dormant: { label: "완전 휴식", message: "회복도 훈련이에요, 보강 운동이나 식단도 잘 챙겨요" },
};

/** BPM 범위 — 안정 심박(하한)부터 최고조(상한)까지. `heart-rate.tsx`가 진폭·속도 매핑에 재사용한다 */
export const BPM_MIN = 50;
/** ratio 1.0 — 직전 4주 평균만큼 뛴 지점. 곡선이 여기서 꺾인다 */
const BPM_PAR = 140;
export const BPM_MAX = 200;
/** 바늘이 상한(200)에 닿는 배수. 더 뛰어도 계기는 200에서 멈춘다 */
const RATIO_TOP = 1.6;

/**
 * ratio(이번 주 / 지난 4주 평균) → BPM. **1.0에서 꺾이는 두 직선.**
 *
 * - `ratio ≤ 1` : `50 + 90·ratio` — 0배 → 50, 1.0배 → 140
 * - `ratio > 1` : `140 + 100·(ratio-1)` — 1.6배 → 200에서 클램프
 *
 * **log2를 걷어낸 이유**: `log2(0)`은 -∞라 아래쪽이 구조적으로 무너졌다. 예전 식
 * (`120 + 125·log2(ratio)`)은 ratio 0.68 아래가 전부 음수로 계산돼 **하한 50에 뭉쳐**,
 * `완전 휴식`·`가벼운 조깅`·`꾸준한 페이스` 아래쪽이 모두 같은 파형·같은 숫자로 나왔다.
 * 라벨만 다르고 계기는 똑같아 고장난 것처럼 보였다.
 *
 * 두 직선은 `ratio 0`에서도 유한하고, 상수가 전부 뜻을 갖는다(50=안정, 140=평균만큼,
 * 200=최고조, 1.6=상한 배수). 무릎이 하나 생기지만 그게 **평균선(ratio 1.0)** 위에 앉아,
 * "평소만큼까지는 완만히, 평소를 넘기면 급하게" 오르는 표현이 된다.
 */
function ratioToBpm(ratio: number): number {
  if (ratio <= 0) return BPM_MIN;
  const bpm =
    ratio <= 1
      ? BPM_MIN + (BPM_PAR - BPM_MIN) * ratio
      : BPM_PAR + ((BPM_MAX - BPM_PAR) * (ratio - 1)) / (RATIO_TOP - 1);
  return Math.round(Math.min(BPM_MAX, bpm));
}

/**
 * 단계 경계 — 각 단계가 시작되는 **ratio 하한**, 높은 쪽부터.
 *
 * - `심장 폭발` 1.3배↑ — 평소의 1.3배는 뛰어야 최상이다
 * - `꾸준한 페이스` 0.9~1.3배 — **평균만큼(1.0)이 여기 들어간다.** "꾸준한 페이스"가 곧
 *   "평소대로"라는 뜻이므로, ratio 1.0은 반드시 이 단계여야 한다
 * - `가벼운 조깅` 0.6~0.9배 — 평소보다 덜 뛴 주
 * - `완전 휴식` 0.6배 미만
 *
 * **경계를 ratio로 적고 BPM은 `ratioToBpm`으로 환산해 쓴다.** BPM 하한을 직접 상수로 박으면
 * 앵커(`BPM_PAR`·`RATIO_TOP`)를 조정하는 순간 경계가 조용히 어긋난다 — 같은 함수를 통과시키면
 * 두 축이 늘 같은 곳을 가리킨다. 환산 결과는
 * `완전 휴식 50~103 / 가벼운 조깅 104~130 / 꾸준한 페이스 131~169 / 심장 폭발 170~200`.
 */
const LEVEL_RATIO_FLOORS: ReadonlyArray<readonly [MoodLevel, number]> = [
  ["blazing", 1.3],
  ["steady", 0.9],
  ["resting", 0.6],
  ["dormant", 0],
];

/**
 * BPM → 단계. **단계는 화면에 찍히는 BPM에서 읽는다** — ratio를 다시 보지 않는다.
 *
 * 예전엔 단계는 ratio 임계값으로, 숫자는 ratio를 매핑한 BPM으로 따로 뽑았다. 두 축이 같은
 * ratio에서 나왔어도 클램프가 끼면 어긋나, 화면에 `50 bpm / 가벼운 조깅`과
 * `50 bpm / 완전 휴식`이 나란히 뜰 수 있었다. 눈금 하나에서 둘 다 읽으면 숫자와 라벨이
 * 어긋나는 일이 구조적으로 불가능해진다(초기 크루의 대표 BPM도 이 하나를 통과한다).
 */
function levelOf(bpm: number): MoodLevel {
  return (
    LEVEL_RATIO_FLOORS.find(([, r]) => bpm >= ratioToBpm(r))?.[0] ?? "dormant"
  );
}

/**
 * BPM → 활동 지수. 단계는 `levelOf`가, 라벨·멘트는 `TEAM_PULSE_SCALE`이 정한다.
 * `message`를 넘기면 표 값 대신 그걸 쓴다 — 완전 무데이터처럼 단계로 안 담기는 예외 문구용.
 */
function pulse(bpm: number, message?: string): TeamPulse {
  const level = levelOf(bpm);
  const scale = TEAM_PULSE_SCALE[level];
  return { level, label: scale.label, message: message ?? scale.message, bpm };
}

/** 이번 주 활동량 = 참석 연인원 + 새 기록. 모임 개수는 규모를 안 담아 제외한다 */
function activityOf(week: TeamWeek): number {
  return week.attd_cnt + week.rec_cnt;
}

/**
 * 최근 8주 → 이번 주 팀 활동 지수. 크루 전체의 "지금 잘 달리고 있나"를 한 단어로.
 *
 * 단계 판정(`MoodLevel`)은 프로필 카드의 개인 컨디션(`getActivityMood`)과 같은 4단계 구조를
 * 쓰지만, 라벨·멘트 텍스트는 공유하지 않는다(`TEAM_PULSE_SCALE`). 여기는 BPM/심전도
 * 그래픽에 맞춰 러닝 페이스·존 은유로 지금 크루가 얼마나 활발한지를 표현한다.
 *
 * 판정 기준도 다르다. 개인은 절대 건수(90일 10회/6회/1회)지만 크루는 규모에 따라
 * 절대값이 제각각이라, **이번 주를 직전 4주 평균과 비교한 비율**로 본다.
 * "지난달보다 활발한가"가 크루 분위기의 실제 질문이기 때문이다.
 *
 * **주는 "같은 요일 경과 시점"끼리 비교한다** — 이 비교의 공정함은 여기가 아니라
 * `get_team_overview` RPC가 진다. 이번 주가 N일째면 RPC가 과거 4주도 각각 N일째까지만
 * 세어 `weeks`에 담아 준다(월요일=지난 4주의 월요일까지). 안 그러면 이번 주만 누적 중이라
 * 월요일엔 분자가 0에 가까워 심박이 무조건 죽고 주말로 갈수록 차오르는 톱니가 생긴다.
 * 그래서 이 함수는 받은 `weeks`를 그대로 평균낼 뿐, 시점 보정은 하지 않는다.
 *
 * @param weeks 오래된 주부터 정렬된 배열. 마지막 원소가 이번 주(지금까지)
 */
export function getTeamPulse(weeks: TeamWeek[]): TeamPulse {
  const current = weeks.at(-1);
  if (!current) return pulse(BPM_MIN, "아직 심박이 잡히지 않았어요");

  const now = activityOf(current);

  // 직전 4주 평균이 기준선. 이번 주는 아직 안 끝났으므로 비교 대상에서 뺀다.
  const past = weeks.slice(-5, -1).map(activityOf);
  const baseline =
    past.length > 0 ? past.reduce((a, b) => a + b, 0) / past.length : 0;

  // 기준선이 없는 초기 크루는 비율을 못 낸다(ratioToBpm을 못 쓴다) — 절대량으로 단계 대표
  // BPM을 직접 준다. 값은 각 단계 구간의 대략 중심이라, 단계는 `levelOf`가 그대로 뽑아낸다.
  if (baseline <= 0) {
    if (now >= 10) return pulse(185); // 심장 폭발 (170~200)
    if (now >= 4) return pulse(150); // 꾸준한 페이스 (131~169)
    if (now >= 1) return pulse(117); // 가벼운 조깅 (104~130)
    return pulse(BPM_MIN); // 완전 휴식 (50~103) — 활동이 아예 없으면 바닥
  }

  // ratio 하나가 숫자와 단계를 다 정한다 — BPM을 뽑고 단계는 그 BPM에서 읽는다.
  return pulse(ratioToBpm(now / baseline));
}
