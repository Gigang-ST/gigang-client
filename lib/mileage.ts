// lib/mileage.ts

export type Sport = "running" | "trail_running" | "cycling" | "swimming";

export const SPORT_LABELS: Record<Sport, string> = {
  running: "러닝",
  trail_running: "트레일러닝",
  cycling: "자전거",
  swimming: "수영",
};

/**
 * 종목별 기본 마일리지 계산 (이벤트 배율 미적용)
 * - 러닝/트레일러닝: km * 1 + m / 100
 * - 자전거: km / 4 + m / 100
 * - 수영: km * 3 (상승고도 없음)
 */
export function calcBaseMileage(
  sport: Sport,
  distanceKm: number,
  elevationM: number,
): number {
  switch (sport) {
    case "running":
    case "trail_running":
      return distanceKm * 1 + elevationM / 100;
    case "cycling":
      return distanceKm / 4 + elevationM / 100;
    case "swimming":
      return distanceKm * 3;
  }
}

/**
 * 이벤트 배율 중첩 적용 (곱셈)
 * multipliers = [] 이면 baseMileage 그대로 반환
 */
export function calcFinalMileage(
  baseMileage: number,
  multipliers: number[],
): number {
  return multipliers.reduce((acc, m) => acc * m, baseMileage);
}

/**
 * 달성 여부에 따른 다음 달 목표 계산
 */
export function calcNextMonthGoal(currentGoal: number, achieved: boolean): number {
  if (!achieved) return currentGoal;
  if (currentGoal < 50) return currentGoal + 10;
  if (currentGoal < 100) return currentGoal + 15;
  return currentGoal + 20;
}

/**
 * KST 기준 현재 시간을 Date 객체로 반환 (내부 헬퍼)
 */
function getKSTDate(): Date {
  // DEBUG: 디버그용 날짜 오버라이드 — 배포 전 제거할 것
  if (process.env.NEXT_PUBLIC_DEBUG_DATE) {
    return new Date(process.env.NEXT_PUBLIC_DEBUG_DATE);
  }
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

/**
 * date를 KST 기준 'YYYY-MM-01' 문자열로 변환
 */
export function toMonthStart(date: Date): string {
  const kst = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * KST 기준 오늘 날짜를 'YYYY-MM-DD' 문자열로 반환
 */
export function todayKST(): string {
  const kst = getKSTDate();
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

/**
 * KST 기준 오늘의 일(day) 반환
 */
export function todayDayKST(): number {
  return getKSTDate().getDate();
}

/**
 * 기간 대비 달성률 계산
 * 경과일 = 오늘 날짜(1일부터 카운트)
 */
export function calcPaceRatio(
  currentMileage: number,
  goalKm: number,
  todayDay: number,
  totalDays: number,
): number {
  if (goalKm === 0) return 0;
  const progressRatio = currentMileage / goalKm;
  const timeRatio = todayDay / totalDays;
  if (timeRatio === 0) return 0;
  return progressRatio / timeRatio;
}

/**
 * 남은 일수 기준 일일 필요 마일리지 (러닝 기준 km)
 */
export function calcDailyNeeded(
  currentMileage: number,
  goalKm: number,
  todayDay: number,
  totalDays: number,
): number | "done" {
  if (currentMileage >= goalKm) return "done";
  const remaining = goalKm - currentMileage;
  const remainingDays = totalDays - todayDay + 1;
  if (remainingDays <= 0) return 0;
  return remaining / remainingDays;
}

/**
 * 월 환급률 (0.0 ~ 1.0)
 */
export function calcMonthRefundRate(
  achievedMileage: number,
  goalKm: number,
): number {
  if (goalKm === 0) return 0;
  return Math.min(achievedMileage / goalKm, 1.0);
}
