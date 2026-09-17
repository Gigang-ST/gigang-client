"use client";

import { usePresenceCount } from "@/lib/presence/store";

/**
 * `지금 보는 중 N명` — 접속자 수를 말하는 **전광판 전용** 라벨.
 *
 * 얼굴들은 전역 레이어(`components/presence/presence-layer.tsx`)가 탭바 위에 그리고, 이
 * 라벨만 전광판에 남는다. **전역으로 올리지 않는다** — 인원수 카운터가 모든 화면 하단에
 * 상주할 이유가 없고, "이 얼굴들이 뭔가"에 답할 자리는 한 곳이면 충분하다.
 *
 * 명단은 채널이 아니라 store에서 읽는다(§lib/presence/store.ts). 여기서 채널을 따로 붙이면
 * 같은 key로 두 번 track하게 된다.
 *
 * 설명(`HelpTip`)은 붙이지 않는다 — 점멸하는 점 + 인원수면 "지금 몇 명이 보고 있다"는 충분히
 * 읽히고, 노는 법(탭하면 튄다)은 한 번 눌러보면 아는 것이라 물음표를 세울 값이 아니다.
 *
 * 0명이면 안 그린다. 접속자가 없다는 건(내가 비로그인이고 아무도 없을 때) 말할 값이 아니고,
 * 채널이 붙기 전 첫 렌더에도 0이라 "0명"이 잠깐 스쳤다 사라지는 깜빡임이 생긴다.
 */
export function PresenceCount() {
  const count = usePresenceCount();
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-6 pt-2">
      <span className="board-blink size-1.5 rounded-full bg-[#ff5d73]" />
      <span className="text-[12px] text-muted-foreground">
        지금 보는 중 {count}명
      </span>
    </div>
  );
}
