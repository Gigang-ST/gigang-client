"use client";

import { MessageCircle } from "lucide-react";

import { Avatar } from "@/components/common/avatar";

/**
 * 릴스 하단 댓글 입력 줄 — 인스타 스토리의 "메시지 보내기" 칸.
 *
 * **진짜 입력창이 아니라 입력창처럼 생긴 버튼**이다. 누르면 시트가 올라오고 거기서 쓴다.
 *
 * **비로그인에게는 "로그인하고 댓글 보기"로 바꿔 건다.** 댓글(`cmnt_mst`)은 SELECT까지
 * 인증 전용이라 비로그인은 남의 댓글을 아예 못 읽는데, 예전엔 이 줄이 "댓글 입력..."이라
 * 쓸 수 있는 것처럼 말하고 개수는 0으로 숨겨져 **"아무도 반응 안 한 사진"으로 오독**됐다
 * (실제로는 댓글이 달려 있다). 못 읽는다는 사실을 이 자리에서 밝히고 로그인으로 잇는다.
 * 누르면 열리는 시트가 "로그인하면 댓글을 볼 수 있어요" + 로그인 버튼을 이어서 보여준다.
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
  /** 로그인해야 댓글을 읽고 쓸 수 있다 — 비로그인에겐 이 줄이 로그인 안내가 된다 */
  const canRead = myMemId != null;

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={
          canRead
            ? count > 0
              ? `댓글 ${count}개 보기`
              : "댓글 달기"
            : "로그인하고 댓글 보기"
        }
        // 스토리의 입력칸과 같은 결 — 테두리만 있는 알약, 배경은 사진이 비치게 아주 옅게.
        className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-white/45 bg-white/10 py-2 pl-2 pr-4 text-left backdrop-blur-[2px] transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        {canRead ? (
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
          {canRead ? "댓글 입력..." : "로그인하고 댓글 보기"}
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
