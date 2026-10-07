// PB 클래스 화면 공용 표기 헬퍼 — 금액을 사람이 읽는 말로 바꾼다.

/**
 * 금액 표기. 만 원 단위로 딱 떨어지면 "4만 원", 아니면 "35,000원".
 *
 * 규칙 문구("참가비 4만 원 = 보증금 3만 + 참가비 1만")는 숫자를 하드코딩하지 않고
 * 관리자 설정값(cfg)에서 뽑는데, 설정이 바뀌어도 읽히는 문장으로 나와야 해서 둘로 갈랐다.
 */
export function formatWon(amount: number): string {
  if (amount > 0 && amount % 10_000 === 0) return `${amount / 10_000}만 원`;
  return `${amount.toLocaleString()}원`;
}

/**
 * 점수 표기. 주차별 평균이 섞이는 팀 점수는 소수 한 자리까지 나오므로(`round1`),
 * 정수면 정수로, 아니면 한 자리로 — "120.0점"처럼 의미 없는 .0 을 달지 않는다.
 */
export function formatPt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}

/**
 * 시간 한도 표기. 60분처럼 분 단위로 딱 떨어지면 "60분", 아니면 "45:30" 같은 시계 표기.
 * 한도(`goalMaxSec`)는 관리자 설정값이라 "1:00:00 이내"보다 "60분 이내"가 사람이 읽는 말이다.
 */
export function formatLimit(sec: number): string {
  if (sec > 0 && sec % 60 === 0) return `${sec / 60}분`;
  const h = Math.floor(sec / 3600);
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${Number(m)}:${s}`;
}
