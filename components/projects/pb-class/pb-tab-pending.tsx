"use client";

import { useLinkStatus } from "next/link";

/**
 * 탭을 누른 뒤 서버가 새 탭을 그려 보낼 때까지의 표시.
 *
 * 탭은 서버에서 그려서(정산 등 조회가 탭마다 다르다) 누르고 바로 바뀌지 않는다. 그 사이 아무 반응이 없으면
 * 한 번 더 누르게 된다 — 눌린 탭 아래에 얇은 막대를 띄워 「받았다」를 말한다. 레이아웃을 밀지 않게 absolute.
 * `prefers-reduced-motion`이면 깜빡이지 않고 막대만 선다.
 */
export function PbTabPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-primary motion-safe:animate-pulse"
    />
  );
}
