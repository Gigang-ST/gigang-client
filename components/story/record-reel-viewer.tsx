"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Zap } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import { usePostComments } from "@/lib/hooks/use-post-comments";
import { getSportEmoji, getSportLabel } from "@/lib/sport";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { RecordCommentBar } from "@/components/story/record-comment-bar";
import { RecordCommentSheet } from "@/components/story/record-comment-sheet";
import { RecordCommentTicker } from "@/components/story/record-comment-ticker";
import { Dialog } from "@/components/ui/dialog";

import type { StoryPost } from "@/lib/queries/story-posts";

/** 거리 표기 — numeric이 10.20으로 와도 10.2로(뒤 0은 정보가 아니다). 격자와 같은 규칙 */
function formatKm(km: number | null): string | null {
  if (km == null || Number.isNaN(km)) return null;
  return `${Number(km.toFixed(2))}km`;
}

/**
 * 레코드보드 릴스 뷰어 — 격자 한 칸을 누르면 열리는 풀스크린 상세.
 *
 * **왜 릴스인가**: 격자는 사진을 훑는 자리라 한마디·거리가 한 줄로 잘린다. 한 칸을 열면
 * 사진이 무대의 주인공이 되고, 그 아래로 누가·언제·얼마나가 온전히 펼쳐진다. 인스타 릴스처럼
 * **위아래로 밀면 다음 발자국**으로 넘어간다 — 자동 전환은 없다(읽는 속도는 사람마다 다르다).
 *
 * **구현은 세로 scroll-snap**이다(포인터를 직접 재지 않는다). `snap-y snap-mandatory`로
 * 한 장씩 딱 걸리고, 관성·키보드·스크린리더 훑기가 브라우저에서 공짜로 따라온다. 지금 어느
 * 장인지는 IntersectionObserver로 읽어 필름 카운터(N/전체)에 쓴다.
 *
 * **무대는 어둡게, 글은 명조로.** 릴스의 관행(검은 배경·흰 글씨)을 따르되, 메타는 프로젝트의
 * 한마디는 "기록을 읽는" 지면의 결을 릴스 안에서도 잇는다. 사진 위 하단
 * 그라디언트에 글을 얹는 인스타 정석 + 우리 서체 대비가 이 뷰어의 시그니처다.
 *
 * **사진은 항상 있다.** 사진 없는 기록은 조회 단계(`get_team_posts`)에서 걸러지므로
 * 여기 닿지 않는다 — 예전의 프사 폴백 무대는 걷어냈다(얼굴을 세우면 기록 자랑이 아니라
 * 프로필 열람이 된다). 마일리지런에서 온 기록은 상단 ⚡ 배지로만 구분한다.
 */
export function RecordReelViewer({
  posts,
  startId,
  open,
  onOpenChange,
  onSelectMember,
  teamId,
  myMemId,
  myName,
  myAvatarUrl,
  isAdmin,
}: {
  posts: StoryPost[];
  /** 격자에서 누른 카드의 post_id — 이 장부터 연다 */
  startId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 이름·프사 탭 → 프로필 카드(위에 겹쳐 열린다). story-client가 stacked로 처리 */
  onSelectMember: (memId: string, name: string) => void;
  /** 댓글 조회·작성에 쓴다 */
  teamId: string;
  /** 비로그인이면 null — 댓글 시트가 로그인 유도로 바뀐다(CommentSection이 처리) */
  myMemId: string | null;
  myName?: string | null;
  myAvatarUrl?: string | null;
  isAdmin?: boolean;
}) {
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  /**
   * 지금 보이는 장의 post_id. 티커가 "보이는 장만" 쿼리·타이머를 돌리게 하는 스위치다 —
   * 릴스는 전 장이 한꺼번에 마운트돼 있어(scroll-snap 목록) 이게 없으면 400장이 동시에
   * 댓글을 읽는다.
   */
  // 초기값은 **누른 장**, 없으면 첫 장이다. null로 두면 관찰자가 첫 콜백을 줄 때까지
  // 어느 장도 "보는 중"이 아니라 댓글을 안 읽고, 스크롤을 안 하면 영영 안 뜬다.
  const [activeId, setActiveId] = useState<string | null>(
    startId ?? posts[0]?.post_id ?? null,
  );
  /** 티커를 눌러 연 댓글 시트 — 릴스 위에 겹친다 */
  const [sheetPost, setSheetPost] = useState<StoryPost | null>(null);

  const startIdx = startId
    ? Math.max(
        0,
        posts.findIndex((p) => p.post_id === startId),
      )
    : 0;

  /**
   * 어느 장을 보고 있는지 관찰한다. 스크롤 위치를 직접 재지 않는 건 snap 목록이라
   * IntersectionObserver가 훨씬 싸고(스크롤 핸들러 0개) 관성 중에도 정확하기 때문.
   * threshold 0.6 — 반 이상 넘어온 장을 "보고 있는 장"으로 친다.
   */
  useEffect(() => {
    if (!open) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = (e.target as HTMLElement).dataset.postId;
            if (id) setActiveId(id);
          }
        }
      },
      { threshold: 0.6 },
    );

    // **다음 프레임에 관찰을 건다.** Radix는 열릴 때 콘텐츠를 이 effect보다 늦게 마운트해서,
    // 지금 바로 훑으면 `cardRefs`가 비어 있어 **아무것도 관찰하지 못한다** — 그러면 activeId가
    // 영영 안 바뀌고, 그 장의 댓글을 아예 안 읽어 말풍선도 개수도 안 뜬다(둘 다 같은 원인).
    // 아래 scrollIntoView 효과가 이미 같은 이유로 rAF를 쓰고 있다.
    const raf = requestAnimationFrame(() => {
      for (const el of cardRefs.current.values()) obs.observe(el);
    });

    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
    // posts.length가 바뀌면(더보기로 이어붙임) 새 장들도 관찰해야 한다.
  }, [open, posts.length]);

  // 열릴 때는 누른 장이 곧 보는 장이다 — 관찰이 첫 콜백을 주기 전에도 티커가 바로 뜨게
  // 초기값을 맞춰 준다(안 맞추면 첫 장 티커가 한 박자 늦게 나타난다).
  //
  // effect가 아니라 **렌더 중 조정**이다(React 공식 "You Might Not Need an Effect" —
  // prop이 바뀌면 렌더 중에 맞춘다). effect로 하면 옛 장의 티커를 한 번 그린 뒤 지우는
  // 캐스케이드 렌더가 되고, 그 사이 프레임에 엉뚱한 장의 댓글이 스친다.
  //
  // startId가 null인 채 열릴 수도 있다(리드 슬롯 진입) — 그땐 첫 장을 보는 것으로 친다.
  // 뷰어는 닫혀도 마운트된 채 남아 useState 초기값이 다시 안 돌기 때문에, 여기서 매번
  // 맞춰 주지 않으면 두 번째 진입부터 이전 장의 activeId가 남는다.
  const [seenStartId, setSeenStartId] = useState(startId);
  if (open && seenStartId !== startId) {
    setSeenStartId(startId);
    setActiveId(startId ?? posts[0]?.post_id ?? null);
  }

  /**
   * 열릴 때 누른 장으로 즉시 점프한다 — 애니메이션 없이(`instant`). 부드럽게 굴리면 첫 장부터
   * 눌린 장까지 스르륵 지나가 "내가 누른 게 이거"라는 연결이 끊긴다. 열림 직후 한 번만.
   */
  useEffect(() => {
    if (!open) return;
    // Radix가 콘텐츠를 마운트한 다음 프레임에 스크롤해야 대상 높이가 잡혀 있다.
    const raf = requestAnimationFrame(() => {
      const target = cardRefs.current.get(posts[startIdx]?.post_id ?? "");
      target?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(raf);
    // startId가 바뀔 때(다른 칸을 눌러 다시 열 때)도 다시 점프해야 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startId]);

  const registerCard = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) cardRefs.current.set(id, el);
      else cardRefs.current.delete(id);
    },
    [],
  );

  return (
    // 프로젝트 Dialog 래퍼를 쓴다(primitive Root 직접 사용 금지) — 안드로이드 뒤로가기가
    // 앱 종료가 아니라 릴스 닫기로 동작하려면 이 래퍼의 useDialogHistoryBack 연동이 필요하다.
    // Content만 primitive로 커스텀한다(기본 DialogContent는 max-w-lg 카드형이라 풀스크린 릴스에
    // 안 맞는다).
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* 무대 배경 — 릴스는 사진이 주인공이라 완전 불투명 검정으로 둘러싼다 */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          // 접근성 이름 — 스크린리더용(아래 sr-only Title과 짝)
          aria-label="기록 자세히 보기"
          className="fixed inset-0 z-50 flex flex-col bg-black text-white outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          // 세로 스와이프가 이 안에서 스크롤이 되도록, 바깥 페이지로 새지 않게 가둔다
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">
            기강 기록 자세히 보기
          </DialogPrimitive.Title>

          {/* 상단 바 — 닫기(우)만. 필름 카운터는 뺐다(피드백). 사진 위에 떠 있어
              그라디언트 없이도 읽히도록 살짝 그림자를 준다. z로 스크롤 콘텐츠 위에 고정. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-end px-5 pt-[calc(env(safe-area-inset-top)+14px)] pb-3">
            <DialogPrimitive.Close className="pointer-events-auto -mr-1.5 flex size-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
              <X className="size-5" />
              <span className="sr-only">닫기</span>
            </DialogPrimitive.Close>
          </div>

          {/* 세로 릴 — snap으로 한 장씩. 스크롤바는 숨기고 오버스크롤은 가둔다. */}
          <div className="scrollbar-none h-full snap-y snap-mandatory overflow-y-auto overscroll-contain">
            {posts.map((post) => (
              <ReelCard
                key={post.post_id}
                ref={registerCard(post.post_id)}
                post={post}
                onSelectMember={onSelectMember}
                teamId={teamId}
                active={open && activeId === post.post_id}
                onOpenComments={() => setSheetPost(post)}
                myMemId={myMemId}
                myAvatarUrl={myAvatarUrl}
              />
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      {/* 댓글 시트 — 릴스(z-50) 위에 z-[60]으로 겹친다. 닫으면 보던 장 그대로 돌아온다.
          Dialog 안에 두는 건 릴스가 열려 있는 동안만 존재하면 되기 때문. */}
      <RecordCommentSheet
        postId={sheetPost?.post_id ?? null}
        postAuthorName={sheetPost?.mem_nm}
        teamId={teamId}
        open={sheetPost !== null}
        onOpenChange={(o) => {
          if (!o) setSheetPost(null);
        }}
        myMemId={myMemId}
        myName={myName}
        myAvatarUrl={myAvatarUrl}
        isAdmin={isAdmin}
      />
    </Dialog>
  );
}

/**
 * 릴 한 장 — 화면 높이를 꽉 채우는(`h-full`) 한 발자국.
 *
 * 위: 사진이 무대의 대부분을 차지한다(중앙 정렬, 비율 유지). 아래: 사진 위로 겹쳐 오르는
 * 하단 그라디언트에 사람·한마디·수치를 얹는다(인스타 정석). 사진과 글이 겹쳐도 그라디언트가
 * 사진 아랫부분을 어둡게 눌러 글이 항상 읽힌다.
 */
const ReelCard = ({
  ref,
  post,
  onSelectMember,
  teamId,
  active,
  onOpenComments,
  myMemId,
  myAvatarUrl,
}: {
  ref: (el: HTMLElement | null) => void;
  post: StoryPost;
  onSelectMember: (memId: string, name: string) => void;
  teamId: string;
  /** 지금 보고 있는 장인가 — 댓글 조회·티커 타이머 스위치 */
  active: boolean;
  onOpenComments: () => void;
  myMemId: string | null;
  myAvatarUrl?: string | null;
}) => {
  // 말풍선 티커와 하단 입력줄의 개수가 **같은 출처**를 본다 — 따로 읽으면 Realtime이
  // 한쪽에만 닿아 "말풍선엔 새 댓글이 떴는데 숫자는 그대로"가 된다.
  const comments = usePostComments(post.post_id, teamId, active);
  const km = formatKm(post.dst_km);
  const label = getSportLabel(post.sprt_enm);
  const emoji = getSportEmoji(post.sprt_enm);
  // 사진은 항상 있다 — 사진 없는 기록은 조회에서 걸러진다(`get_team_posts`).
  // 프사 폴백을 두던 자리인데, 얼굴을 무대에 세우면 "기록 자랑"이 아니라 프로필 열람이 된다.
  const bgSrc = post.photo_url ?? "";

  // 거리·종목·날짜는 **한 줄에 묶지 않는다** — 이 자리는 "얼마나 달렸나"를 자랑하는 곳이라
  // 거리가 주인공이어야 한다. 거리를 큰 숫자로 세우고(종목 이모지·라벨은 그 옆 보조),
  // 날짜는 그 위 작은 kicker로 뺀다.
  const dateLabel = post.act_dt
    ? dayjs(post.act_dt).format("YYYY.MM.DD (ddd)")
    : null;

  return (
    <article
      ref={ref}
      // 관찰자가 "지금 어느 장인지"를 이 값으로 읽는다(엘리먼트→id 역참조를 위해).
      data-post-id={post.post_id}
      className="relative flex h-full snap-start snap-always items-center justify-center overflow-hidden"
    >
      {/*
        스토리 캔버스 — **9:16 고정**(인스타 스토리와 같은 규격, 1080×1920).

        화면 전체를 쓰지 않는 이유: 요즘 폰은 9:19.5~9:21로 더 길쭉해서 화면을 꽉 채우면
        기기마다 무대 비율이 달라진다. 여긴 나중에 **인스타 스토리로 바로 내보내기**를
        붙일 자리라, 화면에서 보이는 그림과 인스타에 올라갈 그림이 같아야 한다 —
        캔버스를 9:16으로 고정해야 "보이는 대로 올라간다"가 성립한다.

        `h-full` + `aspect-[9/16]`로 **높이를 먼저 채우고 폭을 비율로 유도**한다.
        `w-full`로 하면 길쭉한 폰에서 캔버스가 화면 밖으로 넘쳐 하단 정보(입력줄·말풍선)가
        잘린다 — 화면 안에 들어가는 최대 9:16이어야 한다. 폭이 좁고 짧은 기기에선 반대로
        폭이 먼저 차야 하므로 `max-w-full`.
      */}
      <div className="relative aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden">
        {/* 사진 뒤 블러 확장 — 사진 비율이 9:16과 달라 생기는 여백(3:4 사진이면 위아래)을
            사진 자신의 블러로 메운다. 검은 띠 대신 블러를 쓰는 것도 인스타 스토리와 같다.
            object-cover라 캔버스를 꽉 채우고, 위 또렷한 사진이 그 위에 뜬다. */}
        <Image
          src={bgSrc}
          alt=""
          fill
          sizes="100vw"
          unoptimized
          aria-hidden
          className="scale-110 object-cover opacity-40 blur-2xl"
        />
        {/* 또렷한 본 사진 — 원본 비율 유지(contain), 캔버스 가운데. **잘리지 않는다.**
            crop하지 않는 건 러닝 사진이 세로·가로 제각각이라 강제로 자르면 사람이 잘리기
            때문이다(인스타는 올릴 때 사용자가 직접 crop 위치를 정하지만 여긴 그 단계가 없다). */}
        <Image
          src={bgSrc}
          alt={`${post.mem_nm}의 기록 사진`}
          fill
          sizes="100vw"
          unoptimized
          className="object-contain"
        />
      </div>

      {/* 마일리지런에서 온 기록 표시 — 상단에 띄운다. 하단은 그라디언트 정보 영역이라
          자리가 없고, 위쪽은 사진 여백이라 배지 하나가 사진을 덜 가린다. */}
      {post.src_enm === "mlg_auto" && (
        <span className="absolute left-5 top-[calc(env(safe-area-inset-top)+16px)] z-[1] flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
          <Zap className="size-3 fill-current" />
          마일리지런
        </span>
      )}

      {/* 하단 그라디언트 + 정보 — 사진 위로 겹쳐 오른다. pointer-events는 버튼만 받게 좁힌다.
          세로 리듬은 위계로 준다: 한마디→거리는 같은 자랑의 흐름이라 붙이고(mt-2), 거리→사람은
          정보 그룹이 바뀌므로 더 띄운다(mt-4). 균등 gap 대신 mt로 그룹을 눈에 나누게 한다. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex flex-col bg-gradient-to-t from-black/85 via-black/55 to-transparent px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-20">
        {/* 한마디 — 사람이 쓴 말이라 명조로. 릴스라 격자보다 크게(두 줄까지). */}
        {post.cmnt_txt && (
          <p className="pointer-events-auto line-clamp-3 text-balance text-[19px] font-normal leading-[1.45] text-white [overflow-wrap:anywhere] [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
            {post.cmnt_txt}
          </p>
        )}

        {/* 거리 — 이 자리의 주인공. "얼마나 달렸나"가 한눈에 들어오도록 큰 숫자로 세운다.
            종목(이모지+라벨)은 그 옆에 baseline을 맞춰 보조로 붙인다. 거리가 없으면
            (드문 경우) 종목만이라도 남긴다. 한마디가 있으면 그 아래로 살짝만 띄워 붙인다. */}
        {(km || label) && (
          <div className="mt-2.5 flex items-baseline gap-2.5 [text-shadow:0_1px_10px_rgba(0,0,0,0.55)]">
            {km && (
              <span className="font-numeric text-[34px] font-bold leading-none tracking-tight tabular-nums text-white">
                {km}
              </span>
            )}
            {label && (
              <span className="text-[15px] font-medium text-white/90">
                {emoji ? `${emoji} ` : ""}
                {label}
              </span>
            )}
          </div>
        )}

        {/* 댓글 말풍선 — **작성자 이름 바로 위**. 사진에 달린 반응이라 기록 정보(이름·거리)
            위에 얹히고, 맨 아래는 입력칸 자리다(인스타 스토리와 같은 층위). */}
        <div className="mt-4">
          <RecordCommentTicker
            comments={comments}
            active={active}
            onOpen={onOpenComments}
          />
        </div>

        {/* 사람 줄 — 왼쪽 프사·이름·칭호(탭하면 프로필 카드), 오른쪽 날짜(보조).
            위 말풍선과는 정보가 갈리므로 살짝 띄운다. */}
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onSelectMember(post.mem_id, post.mem_nm)}
            aria-label={`${post.mem_nm} 프로필 보기`}
            className="pointer-events-auto flex min-w-0 items-center gap-2.5 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
          >
            <Avatar
              src={post.avatar_url}
              seed={post.mem_id}
              alt={post.mem_nm}
              size="md"
              className="ring-2 ring-white/25"
            />
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[15px] font-bold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
                {post.mem_nm}
              </span>
              {post.primary_title && (
                <TitleBadge
                  name={post.primary_title.ttl_nm}
                  effect={post.badge_effect ?? "none"}
                  size="xs"
                />
              )}
            </span>
          </button>

          {dateLabel && (
            <span className="pointer-events-none shrink-0 font-numeric text-[13px] font-medium tabular-nums text-white/80 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
              {dateLabel}
            </span>
          )}
        </div>

        {/* 댓글 입력 줄 — 맨 아래(스토리의 "메시지 보내기" 칸 자리). 엄지가 닿는 곳이고,
            오른쪽 숫자가 "이 사진에 반응이 몇 개"를 알린다. */}
        <div className="mt-4">
          <RecordCommentBar
            count={comments?.length ?? 0}
            myMemId={myMemId}
            myAvatarUrl={myAvatarUrl}
            onOpen={onOpenComments}
          />
        </div>
      </div>
    </article>
  );
};
