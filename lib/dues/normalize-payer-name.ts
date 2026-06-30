/**
 * 은행 입금자명을 매칭용으로 정규화한다(단일 출처).
 * 업로드 파서와 별칭 조회가 같은 정규화를 쓰도록 이 함수만 사용한다.
 *
 * 규칙: 공백 제거 → 선/후행 "회비" 토큰 제거 → 숫자·특수문자 제거
 *      → 영문 소문자화 → NFC 정규화.
 */
export function normalizePayerName(raw: string): string {
  let s = (raw ?? "").normalize("NFC").trim();
  s = s.replace(/\s+/g, "");
  // 한글/영문/숫자 외 제거 후, 숫자도 제거 (금액 등 노이즈)
  s = s.replace(/[^0-9A-Za-z가-힣]/g, "");
  s = s.replace(/[0-9]/g, "");
  // 선/후행에 붙은 "회비" 라벨 제거 (중간에 포함된 경우는 보존)
  s = s.replace(/^회비/, "").replace(/회비$/, "");
  return s.toLowerCase();
}
