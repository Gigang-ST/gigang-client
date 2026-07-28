"use client";

import { useEffect, useState } from "react";

import { getMentionMembers } from "@/app/actions/comment/get-mention-members";

import { CommentSection } from "@/components/comment/comment-section";
import type { MemberOption } from "@/components/comment/mention-input";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";

/**
 * 운동기록 댓글 시트 — 릴스 하단 티커를 누르면 크게 열리는 하단 다이얼로그.
 *
 * **왜 시트인가**: 릴스는 사진이 주인공이라 스레드를 지면에 펼칠 수 없다. 인스타 스토리도
 * 답장을 누르면 아래에서 판이 올라온다 — 사진을 덮되 닫으면 보던 장으로 정확히 돌아온다.
 *
 * **릴스(z-50) 위에 겹쳐 뜬다.** `overlayClassName`으로 오버레이를 z-[60]까지 올려야
 * 릴스가 시트를 덮지 않는다(프로필 카드의 `stacked`와 같은 처리).
 *
 * 본문은 `CommentSection` 그대로다 — 답글·멘션·수정/삭제·Realtime이 이미 그 안에 있다.
 * 여기서 하는 일은 (1) 릴스 위에 얹을 판을 만들고 (2) 멘션용 멤버 목록을 열릴 때 채우는 것뿐.
 *
 * **멤버 목록은 열 때 받는다.** 릴스 장마다 미리 받아두면 안 열어 볼 시트를 위해 매번
 * 쿼리가 나간다(mini-calendar·race-list-view와 같은 지연 로딩 패턴).
 */
export function RecordCommentSheet({
  postId,
  postAuthorName,
  teamId,
  open,
  onOpenChange,
  myMemId,
  myName,
  myAvatarUrl,
  isAdmin,
}: {
  postId: string | null;
  /** 시트 제목에 쓴다 — "누구의 기록"에 다는 댓글인지 */
  postAuthorName?: string;
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myMemId: string | null;
  myName?: string | null;
  myAvatarUrl?: string | null;
  isAdmin?: boolean;
}) {
  const [members, setMembers] = useState<MemberOption[] | null>(null);

  // 로그인 멤버만 멘션 목록을 받는다(서버 액션이 withMember라 비로그인은 어차피 빈 배열).
  // 한 번 받으면 다시 안 받는다 — 다른 장의 시트를 열어도 팀 멤버 목록은 같다.
  useEffect(() => {
    if (!open || !myMemId || members !== null) return;
    let cancelled = false;
    void getMentionMembers()
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch((err) => {
        // 멘션 자동완성만 못 쓰는 것 — 댓글 작성 자체는 막지 않는다.
        console.error("[RecordCommentSheet] 멘션 멤버 조회 실패", err);
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, myMemId, members]);

  if (!postId) return null;

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent
        // 릴스 뷰어(z-50) 위에 얹는다 — 안 올리면 오버레이가 릴스 아래로 깔려 시트만 떠 보인다.
        //
        // **오버레이는 거의 투명해야 한다**(bg-black/20). 기본값 `bg-black/50`을 두면 시트가
        // 아무리 반투명이어도 뒤에 깔린 건 사진이 아니라 **검은 판**이라, backdrop-blur가
        // 그 판을 흐려 봐야 그냥 짙은 회색이 된다 — "반투명인데 반투명으로 안 보이는" 원인이
        // 여기다. 사진이 비쳐야 반투명으로 읽히므로 오버레이는 최소한만 눌러 준다.
        overlayClassName="z-[60] bg-black/20"
        // 드로어 손잡이(bg-muted)는 아래 CSS 변수 재정의가 닿지 않는 바깥에 있어
        // 어두운 판에서 거의 안 보인다 — 흰색 계열로 직접 덮는다.
        className="[&>div:first-child]:bg-white/25"
        // 인스타 스토리처럼 **크게** 연다. 댓글은 스크롤할 목록이라 반쯤 열면 두세 줄만 보인다.
        //
        // **어두운 반투명 + 배경 블러**(스토리 답장 판): 릴스가 검은 무대라 밝은 시트가
        // 올라오면 눈이 확 튀고, 뒤 사진과의 연결도 끊긴다. 사진이 비쳐야 "이 사진에 달린
        // 댓글"로 읽힌다. 이 존만 다크로 고정하는 건 프로필 카드 스크린 존과 같은 이유다
        // (DESIGN.md §Board) — 무대가 야간이면 그 위 판도 야간.
        //
        // 판 자체는 `/70`까지 내려 사진이 비치게 하고, 흐림을 세게(blur-3xl) 줘서 글이
        // 사진 무늬에 묻히지 않게 한다 — 투명도를 더 올리는 대신 흐림으로 가독성을 산다.
        dialogClassName="z-[60] max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden border-white/10 bg-neutral-900/70 text-white backdrop-blur-3xl backdrop-saturate-150"
        drawerClassName="z-[60] h-[85dvh] max-h-[85dvh] border-white/10 bg-neutral-900/70 text-white backdrop-blur-3xl backdrop-saturate-150"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-white/10 px-4 py-4 text-left">
          <ResponsiveDrawerTitle className="text-white">
            {postAuthorName ? `${postAuthorName}님의 기록` : "댓글"}
          </ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription className="sr-only">
            깅스타그램 댓글
          </ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>

        {/*
          어두운 판 위라 안쪽 CommentSection의 기본 색(foreground/muted-foreground)이
          그대로면 검은 글씨가 검은 판에 묻는다. 컴포넌트를 포크하는 대신 이 래퍼에서
          토큰을 다크 값으로 **재정의**한다 — CommentSection은 어디서든 같은 코드로 돌고,
          색만 이 존의 무대에 맞춰진다(프로필 카드 스크린 존과 같은 처리).
        */}
        <div
          className="flex-1 overflow-y-auto px-4 pb-6 pt-4 [--background:oklch(0.18_0_0)] [--border:oklch(1_0_0/0.14)] [--foreground:oklch(0.98_0_0)] [--muted-foreground:oklch(0.72_0_0)] [--secondary:oklch(1_0_0/0.08)]"
        >
          <CommentSection
            entityType="post"
            entityId={postId}
            teamId={teamId}
            currentMemberId={myMemId ?? undefined}
            currentMemberName={myName}
            currentMemberAvatarUrl={myAvatarUrl}
            isAdmin={isAdmin}
            members={members ?? []}
            loginReturnPath="/story"
          />
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
