/**
 * 은행 입금자명을 매칭용으로 정규화한다(단일 출처).
 * 업로드 파서와 별칭 조회가 같은 정규화를 쓰도록 이 함수만 사용한다.
 *
 * 규칙: NFC 정규화 → 공백 제거 → 숫자·특수문자 제거 → 선/후행 "회비" 토큰 제거
 *      → 영문 소문자화.
 * 순서 주의: 특수문자 제거를 "회비" 제거보다 먼저 한다. 그래야 "홍길동(회비)"처럼
 *      괄호로 감싼 회비 라벨도 특수문자 제거 후 "홍길동회비"가 되어 끝의 "회비"가 벗겨진다.
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

/** 복합 꼬리말(정규화된 형태, 긴 것부터). 이름 끝에 우연히 붙을 일이 거의 없어 그대로 뗀다. */
// "1월 회비 선금"은 숫자가 빠져 "월회비선금"이 된다.
const COMPOUND_SUFFIXES = ["월회비선금", "기강회비", "회비선금", "월회비"];
/** 단독 꼬리말. 실명 끝 글자와 겹칠 수 있어(김기강 → 김기) 떼고 남는 이름이 2글자 이상일 때만 뗀다. */
const SINGLE_SUFFIXES = ["선금", "회비", "기강"];
const MIN_NAME_LEN_AFTER_SINGLE = 2;

/**
 * 정규화된 입금자명 끝에 붙은 꼬리말(기강회비·회비 선금 등)을 떼어 낸다.
 * 입력은 `normalizePayerName` 결과여야 한다. 떼어 낼 게 없으면 입력 그대로 돌려준다.
 * 이름 자체가 꼬리말뿐이면(전부 떼면 빈 문자열) 원본을 돌려준다.
 */
export function stripPayerSuffix(norm: string): string {
  let s = norm;
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of COMPOUND_SUFFIXES) {
      if (s.length > t.length && s.endsWith(t)) {
        s = s.slice(0, -t.length);
        changed = true;
        break;
      }
    }
    if (changed) continue;
    for (const t of SINGLE_SUFFIXES) {
      if (s.length - t.length >= MIN_NAME_LEN_AFTER_SINGLE && s.endsWith(t)) {
        s = s.slice(0, -t.length);
        changed = true;
        break;
      }
    }
  }
  return s;
}
