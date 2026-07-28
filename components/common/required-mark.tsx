/**
 * 필수 입력 표시 — 라벨 뒤에 붙는 빨간 별표.
 *
 * `<Label>필드명<RequiredMark /></Label>` 꼴로 쓴다. 선택 필드는 아무것도 붙이지 않는다
 * (모든 필드에 필수/선택을 다 적으면 라벨이 길어지고 정작 필수가 안 눈에 띈다 —
 * 표시가 있는 것만 필수라는 규칙이면 별표 하나로 충분하다).
 *
 * `aria-hidden`이 아니라 `aria-label`을 준다: 스크린리더에서 "별" 대신 "필수"로 읽힌다.
 * 시각적으론 별표지만 의미는 "이건 반드시 채워야 한다"라서.
 */
export function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" aria-label="필수">
      *
    </span>
  );
}
