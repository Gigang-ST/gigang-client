"use client";

import { useEffect, useRef, useState } from "react";

import Confetti from "react-confetti";

import type { ReactNode } from "react";

/**
 * 감싼 존이 화면에 들어오는 순간 폭죽을 한 번 터뜨린다 — 시상식 입장 축하.
 *
 * **가입 완료 화면과 같은 폭죽이다**(`member-onboarding-form.tsx`의 `<Confetti>`와 같은 세기·같은
 * 자리 — 화면 아래 가운데에서 위로). 앱에서 "축하할 일"을 말하는 몸짓이 이미 있어서 새로 만들지
 * 않는다. 다만 **1.5배 오래** 뿌린다(크루가 정했다 — 시상식은 길게 축하): 조각을 뿌리는 시간
 * `tweenDuration`을 기본 5초 → 7.5초로, 조각 수도 같은 밀도로 500 → 750.
 *
 * 한 번만 터진다(다시 스크롤해 와도 안 터진다). 캔버스는 `pointer-events: none`이라 터지는
 * 동안에도 화면을 만질 수 있다. 다 떨어지면 캔버스째 걷어낸다. 모션을 줄인 사람에겐 안 터뜨린다.
 */
export function RecapCelebrate({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setSize({ w: window.innerWidth, h: window.innerHeight });
        obs.disconnect();
      },
      // 존이 아래에서 화면 중간쯤 올라왔을 때 — 가장자리에 걸치자마자 터지면 시상식을 못 본다.
      // 존이 화면보다 훨씬 길어 비율(threshold)로는 못 잡는다(전체의 20%도 안 보인다).
      { rootMargin: "0px 0px -45% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {children}
      {size && (
        <Confetti
          width={size.w}
          height={size.h}
          recycle={false}
          numberOfPieces={750}
          tweenDuration={7500}
          gravity={0.25}
          initialVelocityY={{ min: -30, max: -10 }}
          initialVelocityX={{ min: -10, max: 10 }}
          confettiSource={{ x: size.w / 2 - 50, y: size.h, w: 100, h: 0 }}
          style={{ position: "fixed", top: 0, left: 0, zIndex: 50, pointerEvents: "none" }}
          onConfettiComplete={() => setSize(null)}
        />
      )}
    </div>
  );
}
