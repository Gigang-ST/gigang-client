"use client";

import { MessageCircle } from "lucide-react";

import { Avatar } from "@/components/common/avatar";

/**
 * 릴스 하단 댓글 입력 줄 — 인스타 스토리의 "메시지 보내기" 칸.
 *
 * **진짜 입력창이 아니라 입력창처럼 생긴 버튼**이다. 누르면 시트가 올라오고 거기서 쓴다.
 * 여기에 실제 `<input>`을 두면 릴스가 `snap-y` 스크롤 컨테이너라 키보드가 올라올 때
 * 스냅과 싸워 장이 반쯤 밀린 채 멈춘다(그리고 이 프로젝트는 vaul에서 이미 비슷한
 * 키보드 문제를 겪었다 — `ui/drawer.tsx`의 repositionInputs 주석 참조).
 * 스토리도 실제로는 탭하면 별도 입력 판이 올라온다.
 *
 * 오른쪽 댓글 수는 "이 사진에 반응이 몇 개"를 말한다 — 말풍선은 한 번에 하나만 보여주므로
 * 전체 규모는 숫자가 알려야 한다. 0개면 숫자를 감춘다(0을 적으면 텅 빈 걸 강조하게 된다).
 */
export function RecordCommentBar({
  count,
  myAvatarUrl,
  myMemId,
  onOpen,
}: {
  count: number;
  myAvatarUrl?: string | null;
  /** 비로그인이면 null — 아바타 자리를 말풍선 아이콘으로 대체한다 */
  myMemId: string | null;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={count > 0 ? `댓글 ${count}개 보기` : "댓글 달기"}
        // 스토리의 입력칸과 같은 결 — 테두리만 있는 알약, 배경은 사진이 비치게 아주 옅게.
        className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-white/45 bg-white/10 py-2 pl-2 pr-4 text-left backdrop-blur-[2px] transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        {myMemId ? (
          <Avatar
            src={myAvatarUrl}
            seed={myMemId}
            alt=""
            size="sm"
            className="size-6 shrink-0 ring-1 ring-white/30"
          />
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/20">
            <MessageCircle className="size-3.5 text-white/90" />
          </span>
        )}
        <span className="truncate text-[13px] text-white/75">
          댓글 입력...
        </span>
      </button>

      {/* 댓글 수 — 입력칸 오른쪽. 아이콘 + 숫자를 붙여 "댓글이 몇 개"임을 분명히 한다. */}
      {count > 0 && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`댓글 ${count}개 모두 보기`}
          className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-full px-1 py-1 text-white/90 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
        >
          <MessageCircle className="size-[18px]" />
          <span className="font-numeric text-[13px] font-semibold tabular-nums [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
            {count}
          </span>
        </button>
      )}
    </div>
  );
}
