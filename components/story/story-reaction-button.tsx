"use client";

import { useState, useTransition } from "react";

import { toast } from "sonner";

import { toggleStoryReaction } from "@/app/actions/story/toggle-reaction";
import { cn } from "@/lib/utils";

import type { RctnCd, StoryEntityType } from "@/lib/queries/story-feed";

/** 리액션 코드 → 이모지 + 라벨 (정본 6종 중 전광판에서 쓰는 것) */
const RCTN_LABEL: Record<RctnCd, { emoji: string; label: string }> = {
  welcome: { emoji: "👏", label: "환영" },
  fire: { emoji: "🔥", label: "대박" },
  cheer: { emoji: "💪", label: "응원" },
  clap: { emoji: "👏", label: "짝짝" },
  lol: { emoji: "😂", label: "ㅋㅋ" },
  boo: { emoji: "😈", label: "야유" },
};

/**
 * 리액션 버튼 — 낙관적 업데이트로 즉시 반응하고, 실패하면 되돌린다.
 *
 * 비로그인·비활성 멤버는 서버 액션이 막으므로 여기서 따로 게이트하지 않고
 * 실패 메시지를 그대로 보여준다.
 */
export function StoryReactionButton({
  entityType,
  entityId,
  rctnCd,
  initialCount,
  initialMine,
  tone = "app",
}: {
  entityType: StoryEntityType;
  entityId: string;
  rctnCd: RctnCd;
  initialCount: number;
  initialMine: boolean;
  /** "board" — 전광판 스크린 존 안. 야간 배경이라 앰버/보드 토큰으로 갈아입는다 */
  tone?: "app" | "board";
}) {
  const [count, setCount] = useState(initialCount);
  const [mine, setMine] = useState(initialMine);
  const [pending, startTransition] = useTransition();

  const { emoji, label } = RCTN_LABEL[rctnCd];

  function handleClick() {
    if (pending) return;

    // 낙관적 갱신 — 서버 왕복을 기다리지 않는다.
    const nextMine = !mine;
    const prevMine = mine;
    const prevCount = count;
    setMine(nextMine);
    setCount((c) => c + (nextMine ? 1 : -1));

    startTransition(async () => {
      const result = await toggleStoryReaction({ entityType, entityId, rctnCd });
      if (!result.ok) {
        setMine(prevMine);
        setCount(prevCount);
        toast.error(result.message ?? "잠시 후 다시 시도해 주세요");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={mine}
      aria-label={`${label} ${count}개`}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2",
        tone === "board"
          ? [
              "focus-visible:ring-board-amber",
              mine
                ? "border-board-amber/50 bg-board-amber/15 text-board-amber"
                : "border-board-line bg-white/5 text-board-foreground hover:bg-white/10",
            ]
          : [
              "focus-visible:ring-ring",
              mine
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-muted/50 text-foreground hover:bg-muted",
            ],
      )}
    >
      <span aria-hidden>{emoji}</span>
      <span>{label}</span>
      {count > 0 && (
        <span className="font-mono tabular-nums">{count}</span>
      )}
    </button>
  );
}
