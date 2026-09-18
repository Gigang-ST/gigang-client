"use client";

/**
 * 바로 다음에 오는 `click` **한 번**을 문서 캡처 단계에서 삼킨다.
 *
 * ## 왜 필요한가 — 공은 움직이는 표적이다
 *
 * 접속자 공을 누르면 그 자리에서 **위로 튀어 커서 밑에서 사라진다.** 그래서 누른 자리와 뗀
 * 자리가 다르고, 뗀 자리엔 뒤에 있던 다른 버튼(깅스타그램 칸 등)이 남아 있다. 공을 튕기려던
 * 탭 하나가 남의 버튼까지 누르는 게 이 구조의 기본값이다.
 *
 * ## `preventDefault()`로는 못 막는다 — 오히려 그게 원인이다
 *
 * `pointerdown`의 `preventDefault()`는 스펙상 **호환 마우스 이벤트(`mousedown`·`mouseup`)까지만**
 * 막고 `click`은 못 막는다. 그런데 `mousedown`이 안 나가면 브라우저가 "누른 요소"를 기록하지
 * 못해, 평소라면 누른 곳과 뗀 곳의 **공통 조상**(= 대개 `<body>`, 아무 핸들러도 없는 곳)에서
 * 났을 `click`이 **뗀 자리 요소**로 떨어진다. 관통을 막으려고 넣은 방어가 관통을 만들고 있었다.
 *
 * 그래서 막을 것은 `mousedown`이 아니라 **그 탭에서 비롯된 `click` 자체**다.
 *
 * ## 왜 캡처 단계에서, 왜 document인가
 *
 * React는 리스너를 루트 컨테이너에 모아 단다. `document`는 그 위라, 여기 **캡처** 리스너를
 * 걸면 React가 이벤트를 보기 전에 끊을 수 있다. 버블 단계나 더 아래에 걸면 이미 늦는다.
 *
 * ## 스스로 물러난다
 *
 * 탭이 취소되면(`pointercancel`, 창 포커스 이동 등) `click`이 영영 안 올 수 있다. 리스너가
 * 남아 있으면 한참 뒤 사용자가 누르는 **무관한 클릭**을 잡아먹으므로, 짧은 시간 뒤 스스로
 * 떨어진다. 400ms는 사람이 누르고 떼는 시간(길게 눌러도 보통 300ms 안)보다 넉넉하면서,
 * 다음 조작이 시작되기 전엔 사라질 만큼 짧다.
 */
export function swallowNextClick(): void {
  if (typeof document === "undefined") return;

  // ⚠️ `true`가 아니라 **`{ capture: true }`**로 건다. 브라우저는 boolean 단축형도 받지만
  // Node의 `EventTarget`은 remove에서 boolean을 매칭하지 못해 리스너가 영영 안 떨어진다
  // (테스트가 실제로 이걸 잡았다). 옵션 객체는 어느 쪽에서도 모호하지 않다.
  const OPTS = { capture: true } as const;

  // `cleanup`·`kill`·`timer`는 서로를 앞뒤로 참조한다. 셋 다 **호출 시점엔** 이미 초기화돼
  // 있으므로(리스너가 실제로 도는 건 등록 이후다) 선언 순서는 문제가 되지 않는다.
  const cleanup = () => {
    document.removeEventListener("click", kill, OPTS);
    clearTimeout(timer);
  };

  const kill = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    cleanup();
  };

  document.addEventListener("click", kill, OPTS);
  const timer = setTimeout(cleanup, 400);
}
