// lib/mileage.ts — 마일리지런 계산 유틸리티 (순수 함수)

export type MileageSport = "RUNNING" | "TRAIL" | "CYCLING" | "SWIMMING";

export const MILEAGE_SPORT_LABELS: Record<MileageSport, string> = {
  RUNNING: "러닝",
  TRAIL: "트레일러닝",
  CYCLING: "자전거",
  SWIMMING: "수영",
};

/**
 * 종목별 기본 마일리지 계산 (이벤트 배율 미적용)
 * - 러닝/트레일러닝: km + 상승고도(m) / 100
 * - 자전거: km / 4 + 상승고도(m) / 100
 * - 수영: km × 3 (상승고도 없음)
 */
export function calcBaseMileage(
  sport: MileageSport,
  distanceKm: number,
  elevationM: number,
): number {
  switch (sport) {
    case "RUNNING":
    case "TRAIL":
      return distanceKm + elevationM / 100;
    case "CYCLING":
      return distanceKm / 4 + elevationM / 100;
    case "SWIMMING":
      return distanceKm * 3;
  }
}

/** 이벤트 배율 중첩 적용 (곱셈). multipliers가 빈 배열이면 baseMileage 그대로 반환 */
export function calcFinalMileage(
  baseMileage: number,
  multipliers: number[],
): number {
  return multipliers.reduce((acc, m) => acc * m, baseMileage);
}

/** 달성 여부에 따른 다음 달 목표 계산 */
export function calcNextMonthGoal(currentGoal: number, achieved: boolean): number {
  if (!achieved) return currentGoal;
  if (currentGoal < 50) return currentGoal + 10;
  if (currentGoal < 100) return currentGoal + 15;
  return currentGoal + 20;
}

/** 월 환급률 (0.0 ~ 1.0) */
export function calcMonthRefundRate(
  achievedMileage: number,
  goalKm: number,
): number {
  if (goalKm === 0) return 0;
  return Math.min(achievedMileage / goalKm, 1.0);
}

/** 기간 대비 달성률 */
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

/** 남은 일수 기준 일일 필요 마일리지 (러닝 기준 km) */
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

/** 두 월 사이의 개월 수 (from ~ to, 양쪽 포함) */
export function countMonths(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max((ty - fy) * 12 + (tm - fm) + 1, 0);
}

/** 마일리지 소수점 둘째자리까지 반올림 */
export function roundMileage(value: number): number {
  return Math.round(value * 100) / 100;
}

// 비즈니스 상수
export const DEPOSIT_PER_MONTH = 10_000;
/** 참가비: 싱글렛 미보유 */
export const ENTRY_FEE = 20_000;
/** 참가비: 싱글렛 보유 */
export const ENTRY_FEE_WITH_SINGLET = 10_000;
