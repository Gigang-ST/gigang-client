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
