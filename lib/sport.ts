// lib/sport.ts — 개인 운동 종목 공용 코드·라벨 (순수 상수)
//
// 마일리지런에서 시작한 종목이지만, 기록 자랑·향후 통합 기록 입력 다이얼로그도 **같은 코드**를
// 쓴다. 정본은 DB enum `evt_mlg_sprt_enm`(RUNNING/TRAIL/CYCLING/SWIMMING, 대문자)이다 —
// 마일리지런이 이미 이 enum으로 종목을 확정해 저장하므로, 여기 상수도 그 대문자 코드를 그대로
// 쓴다(소문자로 바꾸면 잘 돌아가는 마일리지 enum·계산 로직을 통째로 흔들어야 한다).
//
// 대회 종목(comp_sprt_cd: road_run·trail_run·triathlon·ultra…)과는 **완전히 별개**다.
// 대회는 대회 종목 체계를, 개인 운동 기록(마일리지·자랑)은 이 체계를 쓴다. 섞지 않는다.
//
// lib/mileage.ts에 하드코딩돼 있던 걸 여기로 올렸다. 마일리지 계산 유틸(server 로직)과
// 종목 상수(클라도 읽는 표시용)를 갈라, 기록 자랑 같은 클라 컴포넌트가 계산 유틸을 통째로
// 끌어오지 않게 한다. mileage.ts는 이 파일에서 재export해 기존 import를 유지한다.

/** 개인 운동 종목 코드 — DB enum evt_mlg_sprt_enm과 동일(대문자). 마일리지·기록자랑이 공유 */
export type SportCode = "RUNNING" | "TRAIL" | "CYCLING" | "SWIMMING";

/** 종목 코드 → 화면 라벨 */
export const SPORT_LABELS: Record<SportCode, string> = {
  RUNNING: "러닝",
  TRAIL: "트레일러닝",
  CYCLING: "자전거",
  SWIMMING: "수영",
};

/** 종목 코드 → 라벨. 알 수 없는 코드(옛 데이터 등)는 null(표시 생략) */
export function getSportLabel(sport: string | null | undefined): string | null {
  if (!sport) return null;
  return SPORT_LABELS[sport as SportCode] ?? null;
}

/** 종목 코드 → 이모지. 프로젝트(마일리지런) 한마디·기록 자랑이 종목을 그림 하나로 보여줄 때 쓴다 */
export const SPORT_EMOJI: Record<SportCode, string> = {
  RUNNING: "🏃",
  TRAIL: "🏔️",
  CYCLING: "🚴",
  SWIMMING: "🏊",
};

/** 종목 코드 → 이모지. 알 수 없는 코드는 null(호출부가 폴백을 정한다) */
export function getSportEmoji(sport: string | null | undefined): string | null {
  if (!sport) return null;
  return SPORT_EMOJI[sport as SportCode] ?? null;
}
