"use client";

import { useEffect } from "react";

import { setPresenceDrawing } from "@/lib/presence/store";

/**
 * "이 화면엔 하단 탭바가 있다"를 store에 알리는 표식 — `(main)` 레이아웃에 하나 둔다.
 *
 * 아무것도 그리지 않는다. 전역 접속자 레이어(`presence-layer.tsx`)는 `<body>` 직계라
 * `(main)` 트리 **바깥**에 있어서 자기가 어느 라우트 그룹에 있는지 알 방법이 없다. 이 표식이
 * 마운트/언마운트로 그걸 알려 준다.
 *
 * **CSS(`body:has()`)로 하지 않는 이유**: 숨기기만 해서는 rAF 루프가 계속 돈다. 안 그리는
 * 화면에선 **계산까지 멈춰야** 하므로 JS가 알아야 한다.
 *
 * **채널은 이것과 무관하게 계속 살아 있다.** 여기서 끄는 건 그리기뿐이다 — 채널까지 끊으면
 * 내가 설정에 잠깐 들어갈 때마다 남들 화면에서 내 공이 사라졌다 새로 떨어진다
 * (§`lib/presence/store.ts`).
 */
export function PresenceFloor() {
  useEffect(() => {
    setPresenceDrawing(true);
    return () => setPresenceDrawing(false);
  }, []);
  return null;
}
