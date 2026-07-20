/**
 * 모임 참석 취소 사유(reason) 검증.
 *
 * 서버 액션은 "use server" 엔드포인트라 임의 인자로 호출될 수 있어(예: 수 MB 텍스트),
 * RPC 호출 전에 길이 상한을 서버에서 강제한다. DB 측에도 동일한 상한(char_length <= 500)
 * CHECK 제약이 있어 이중 방어. 초과 시 잘라내지 않고 명시적으로 거부한다(잘림보다 명확).
 */

export const GATHERING_CANCEL_REASON_MAX_LENGTH = 500;

export const GATHERING_CANCEL_REASON_TOO_LONG_MESSAGE = `취소 사유는 ${GATHERING_CANCEL_REASON_MAX_LENGTH}자 이내로 입력해주세요.`;

export type CancelReasonResult =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

/**
 * 취소 사유를 정규화·검증한다.
 * - null/undefined 또는 trim 후 빈 문자열 → 사유 없음(null)
 * - trim 후 500자 초과 → 거부(잘라내지 않음)
 * - 그 외 → trim 된 값
 */
export function validateCancelReason(reason?: string | null): CancelReasonResult {
  if (reason == null) return { ok: true, value: null };

  const trimmed = reason.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > GATHERING_CANCEL_REASON_MAX_LENGTH) {
    return { ok: false, message: GATHERING_CANCEL_REASON_TOO_LONG_MESSAGE };
  }
  return { ok: true, value: trimmed };
}
