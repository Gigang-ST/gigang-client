"use client";

import { useEffect, useRef } from "react";

import type { ReactNode } from "react";

/**
 * 스크롤 등장 — 화면 아래에 있는 덩어리를 숨겨 뒀다가 들어올 때 보여 준다.
 *
 * **마운트 때 이미 보이는 건 건드리지 않는다.** 서버가 그린 첫 화면을 JS가 숨겼다 다시 보이면
 * 로드 직후 멀쩡한 내용이 한 번 깜빡인다. 그래서 숨기는 건 "아직 아래에 있어 안 보이는 것"뿐이고,
 * 그건 숨겨도 사용자가 볼 수 없다.
 *
 * 상태는 React state가 아니라 **DOM 속성**(`data-reveal`)이 들고 있다 — 안의 막대·오도미터·도장은
 * CSS가 이 속성을 보고 움직이므로(globals.css §돌아보기) 리렌더할 이유가 없다.
 * 모션을 줄인 사람에겐 아무것도 하지 않는다(처음부터 완성된 모습).
 */
export function RecapReveal({
  children,
  className,
  rootMargin = "0px 0px -15% 0px",
}: {
  children: ReactNode;
  className?: string;
  /**
   * 켜지는 시점 — 기본은 바닥에서 조금(15%) 올라왔을 때. 크루 그리드처럼 "충분히 올라와서 다
   * 보일 때" 시작해야 하는 건 더 깊게 준다(그래야 앞사람들이 화면 밖에서 박히지 않는다).
   */
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    el.dataset.reveal = "pending";
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.reveal = "in";
        obs.disconnect();
      },
      // 바닥에서 조금 올라온 뒤에 켠다 — 가장자리에 걸치자마자 돌면 막대가 다 자란 뒤에야 보인다
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
