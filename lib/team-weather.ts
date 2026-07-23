import type { TeamWeek } from "@/lib/queries/team-overview";

/**
 * 기강 기상 — 크루 전체의 "지금 잘 달리고 있나"를 한 단어로.
 *
 * 프로필 카드의 개인 컨디션(`getActivityMood`)과 **같은 4단계 어휘**를 쓴다.
 * 개인 카드에서 "기강 잡아"를 본 사람이 크루 박스에서도 같은 말을 만나야
 * 두 지표가 같은 척도라는 게 설명 없이 전달된다.
 *
 * 다만 판정 기준은 다르다. 개인은 절대 건수(90일 10회/6회/1회)지만 크루는 규모에 따라
 * 절대값이 제각각이라, **이번 주를 직전 4주 평균과 비교한 비율**로 본다.
 * "지난달보다 활발한가"가 크루 분위기의 실제 질문이기 때문이다.
 */
export type TeamWeather = {
  level: "blazing" | "steady" | "resting" | "dormant";
  /** 표정 라벨 — 개인 컨디션과 같은 어휘 */
  label: string;
  /** 판정 근거를 사람 말로. 숫자를 다시 읽어주지 않는다 */
  message: string;
};

/** 이번 주 활동량 = 참석 연인원 + 새 기록. 모임 개수는 규모를 안 담아 제외한다 */
function activityOf(week: TeamWeek): number {
  return week.attd_cnt + week.rec_cnt;
}

/**
 * 최근 8주 → 이번 주 기상.
 *
 * @param weeks 오래된 주부터 정렬된 배열. 마지막 원소가 이번 주(지금까지)
 */
export function getTeamWeather(weeks: TeamWeek[]): TeamWeather {
  const current = weeks.at(-1);
  if (!current) {
    return {
      level: "dormant",
      label: "실종",
      message: "아직 기록된 활동이 없습니다",
    };
  }

  const now = activityOf(current);

  // 직전 4주 평균이 기준선. 이번 주는 아직 안 끝났으므로 비교 대상에서 뺀다.
  const past = weeks.slice(-5, -1).map(activityOf);
  const baseline =
    past.length > 0 ? past.reduce((a, b) => a + b, 0) / past.length : 0;

  // 기준선이 없는 초기 크루는 비율을 못 낸다 — 절대량으로만 판정한다.
  if (baseline <= 0) {
    if (now >= 10) {
      return { level: "blazing", label: "기강 그 자체", message: "이번 주 크루가 제대로 달리는 중" };
    }
    if (now >= 4) {
      return { level: "steady", label: "기강 잡아", message: "이번 주도 꾸준히 나오고 있습니다" };
    }
    if (now >= 1) {
      return { level: "resting", label: "기며든다", message: "이번 주는 조용한 편입니다" };
    }
    return { level: "dormant", label: "실종", message: "이번 주는 아직 아무도 안 나왔습니다" };
  }

  const ratio = now / baseline;

  if (ratio >= 1.3) {
    return {
      level: "blazing",
      label: "기강 그 자체",
      message: "지난 4주 평균보다 눈에 띄게 활발한 주",
    };
  }
  if (ratio >= 0.9) {
    return {
      level: "steady",
      label: "기강 잡아",
      message: "지난 4주와 비슷하게 굴러가는 중",
    };
  }
  if (ratio >= 0.4) {
    return {
      level: "resting",
      label: "기며든다",
      message: "지난 4주 평균보다 조용한 주",
    };
  }
  return {
    level: "dormant",
    label: "실종",
    message: "이번 주는 크루가 많이 쉬고 있습니다",
  };
}

/**
 * 스파크라인 막대 높이(%) — 가장 활발했던 주를 100으로 맞춘 상대값.
 * 0인 주도 막대가 보이도록 최소 8%를 준다(빈칸과 "활동 0"은 다른 정보다).
 */
export function getTrendBars(weeks: TeamWeek[]): number[] {
  const values = weeks.map(activityOf);
  const max = Math.max(...values, 1);
  return values.map((v) => Math.max(8, Math.round((v / max) * 100)));
}
