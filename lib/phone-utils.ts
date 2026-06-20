export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

/**
 * 한국 휴대폰 입력을 11자리 로컬 표기(010…) 숫자열로 정규화한다.
 * iOS/안드로이드 연락처 자동완성이 국가번호(+82) 형식으로 채우는 경우를 흡수한다.
 * 예: "+82 10-7597-2469" → "01075972469", "+82 010 1234 5678" → "01012345678"
 */
export function normalizeKoreanMobileDigits(value: string) {
  let digits = digitsOnly(value);
  if (digits.startsWith("82")) {
    digits = digits.slice(2);
    if (!digits.startsWith("0")) digits = `0${digits}`;
  }
  return digits;
}

export function formatPhone(value: string) {
  const digits = normalizeKoreanMobileDigits(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

export function isValidPhone(value: string) {
  return /^010\d{8}$/.test(normalizeKoreanMobileDigits(value));
}
