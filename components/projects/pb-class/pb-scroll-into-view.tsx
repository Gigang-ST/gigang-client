"use client";

import { useEffect } from "react";

/**
 * 마운트 때 한 번, 대상이 화면 아래쪽에 묻혀 있으면 끌어올린다 — 훈련표의 「이번 주」 칸.
 *
 * 13주 중 9주차를 보러 들어왔는데 1주차부터 손으로 내려가게 하면 탭을 연 이유가 사라진다.
 * 이미 화면 위쪽 절반 안에 있으면 건드리지 않는다(쓸데없는 움직임). 사용자가 움직임 줄이기를 켰으면
 * 부드럽게 굴리지 않고 바로 옮긴다. 렌더는 아무것도 하지 않는다.
 */
export function PbScrollIntoView({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight * 0.5) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [targetId]);
  return null;
}
