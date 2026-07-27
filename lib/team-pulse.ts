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
 * 재사용하고 텍스트는 이 표 하나에만 둔다(ratio 분기·baseline-less 분기가 같이 참조).
 */
const TEAM_PULSE_SCALE: Record<MoodLevel, { label: string; message: string }> = {
  blazing: { label: "심장 폭발", message: "인터벌 훈련을 고강도로 운동 중이에요" },
  steady: { label: "꾸준한 페이스", message: "다들 꾸준한 페이스로 달리고 있어요" },
  resting: { label: "가벼운 조깅", message: "다들 가볍게 몸을 풀고 있어요" },
  dormant: { label: "완전 휴식", message: "회복도 훈련이에요, 보강 운동이나 식단도 잘 챙겨요" },
};

/** BPM 범위 — 안정 심박(하한)부터 최고조(상한)까지. `heart-rate.tsx`가 진폭·속도 매핑에 재사용한다 */
export const BPM_MIN = 50;
const BPM_MID = 120; // ratio 1.0(지난 4주 평균만큼) = 러닝 존2 중심
export const BPM_MAX = 200;
/**
 * log 기울기 — ratio가 2배(log2=1)일 때 중간값에서 얼마나 오르는지(+125 → 245는 상한 클램프).
 * 크게 잡을수록 좁은 ratio 변화도 BPM에 크게 반영된다. 실측 안정 범위(prd 0.77~1.25)를
 * 73~160으로 시원하게 벌리도록 125로 잡았다(ratio 1.25가 160이 되게 — 운영 판단).
 */
const BPM_K = 125;

/**
 * ratio(이번 주 / 지난 4주 평균) → BPM. **log2 스케일**로 1.0을 중간값(120)에 두고 양쪽으로.
 *
 * `bpm = 120 + 125·log2(ratio)`, [50, 200]으로 자른다(상한은 클램프일 뿐 ratio 상한은 없다).
 * - ratio 0.5 → 50(클램프), 0.77 → 73, 1.0 → 120, 1.25 → 160, 1.6↑ → 200(클램프)
 *
 * log를 쓰는 이유: 크루마다 활동 구성이 달라 ratio 분포 폭이 제각각이다(마일리지런이 매주
 * 깔린 크루는 0.8~1.3으로 좁고, 대회 위주 크루는 0.5~8로 넓다). 선형이면 좁은 크루는 심박이
 * 밋밋하고 넓은 크루는 늘 상한에 붙는다. log는 좁은 변화를 펴고 큰 튐(대회 폭발)은 눌러,
 * 어떤 크루든 평균(1.0=120) 주변에서 자연스럽게 뛰게 한다.
 */
function ratioToBpm(ratio: number): number {
  if (ratio <= 0) return BPM_MIN;
  const bpm = BPM_MID + BPM_K * Math.log2(ratio);
  return Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, bpm)));
}

/**
 * 단계 키 + BPM → 활동 지수. 라벨·멘트는 `TEAM_PULSE_SCALE`에서 가져온다.
 * bpm은 호출부가 ratio에서 계산해 넘긴다(초기 크루처럼 ratio가 없으면 대표값을 직접 준다).
 * `message`를 넘기면 표 값 대신 그걸 쓴다 — 완전 무데이터처럼 단계로 안 담기는 예외 문구용.
 */
function pulse(level: MoodLevel, bpm: number, message?: string): TeamPulse {
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
  if (!current) return pulse("dormant", BPM_MIN, "아직 심박이 잡히지 않았어요");

  const now = activityOf(current);

  // 직전 4주 평균이 기준선. 이번 주는 아직 안 끝났으므로 비교 대상에서 뺀다.
  const past = weeks.slice(-5, -1).map(activityOf);
  const baseline =
    past.length > 0 ? past.reduce((a, b) => a + b, 0) / past.length : 0;

  // 기준선이 없는 초기 크루는 비율을 못 낸다 — 절대량으로 판정하고 BPM은 단계 대표값을 준다
  // (ratio가 없어 ratioToBpm을 못 쓴다). 대표값은 각 단계의 대략 중심.
  if (baseline <= 0) {
    if (now >= 10) return pulse("blazing", 150);
    if (now >= 4) return pulse("steady", 120);
    if (now >= 1) return pulse("resting", 85);
    return pulse("dormant", BPM_MIN);
  }

  const ratio = now / baseline;
  const bpm = ratioToBpm(ratio);

  // 임계값: 1.0 / 0.5 / 0.3. 이번 주가 직전 4주 평균만큼만 해도 최상('심장 폭발')이다 —
  // 꾸준한 크루가 영원히 2단계에 머물지 않게 한 조정(예전엔 1.3배를 넘어야 최상이었다).
  // 단계는 임계값으로, BPM은 ratio를 log 매핑한 연속값으로 — 둘의 기준이 같은 ratio다.
  if (ratio >= 1.0) return pulse("blazing", bpm);
  if (ratio >= 0.5) return pulse("steady", bpm);
  if (ratio >= 0.3) return pulse("resting", bpm);
  return pulse("dormant", bpm);
}
