/**
 * 필수 입력 표시 — 라벨 뒤에 붙는 빨간 별표.
 *
 * `<Label>필드명<RequiredMark /></Label>` 꼴로 쓴다. 선택 필드는 아무것도 붙이지 않는다
 * (모든 필드에 필수/선택을 다 적으면 라벨이 길어지고 정작 필수가 안 눈에 띈다 —
 * 표시가 있는 것만 필수라는 규칙이면 별표 하나로 충분하다).
 *
 * `aria-hidden`이 아니라 `aria-label`을 준다: 스크린리더에서 "별" 대신 "필수"로 읽힌다.
 * 시각적으론 별표지만 의미는 "이건 반드시 채워야 한다"라서.
 *
 * `role="img"`가 함께 있어야 그 이름이 실제로 읽힌다 — 맨 `<span>`은 암묵 role이 generic이고,
 * generic 요소는 작성자 지정 이름(naming)이 허용되지 않아 `aria-label`이 조합에 따라
 * 통째로 무시된다. 그러면 "필수"도 "별"도 아닌 **아무 말도 안 나온다**.
 */
export function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" role="img" aria-label="필수">
      *
    </span>
  );
}
