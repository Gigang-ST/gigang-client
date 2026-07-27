"use client";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import { getSportEmoji, getSportLabel } from "@/lib/sport";

import { Avatar, buildFallbackAvatarUrl } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
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
 * 명조(font-serif)로 적어 "기록을 읽는" 지면의 결을 릴스 안에서도 잇는다. 사진 위 하단
 * 그라디언트에 글을 얹는 인스타 정석 + 우리 서체 대비가 이 뷰어의 시그니처다.
 *
 * **사진 없는 기록**(마일리지런 자동 유입분 등)은 프사를 블러로 깔아 무대를 만들고 그 위에
 * 프사를 또렷하게 세운다 — 격자에선 프사로 칸을 꽉 채웠지만, 풀스크린에선 512px 프사를
 * 그대로 늘리면 뭉개져 무대가 초라해진다. 블러 배경이 그 빈자리를 메운다.
 */
export function RecordReelViewer({
  posts,
  startId,
  open,
  onOpenChange,
  onSelectMember,
}: {
  posts: StoryPost[];
  /** 격자에서 누른 카드의 post_id — 이 장부터 연다 */
  startId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 이름·프사 탭 → 프로필 카드(위에 겹쳐 열린다). story-client가 stacked로 처리 */
  onSelectMember: (memId: string, name: string) => void;
}) {
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const startIdx = startId
    ? Math.max(
        0,
        posts.findIndex((p) => p.post_id === startId),
      )
    : 0;

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
              />
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
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
}: {
  ref: (el: HTMLElement | null) => void;
  post: StoryPost;
  onSelectMember: (memId: string, name: string) => void;
}) => {
  const km = formatKm(post.dst_km);
  const label = getSportLabel(post.sprt_enm);
  const emoji = getSportEmoji(post.sprt_enm);
  const hasPhoto = Boolean(post.photo_url);
  // 사진이 없으면 프사를 무대에 세운다(블러 배경 + 또렷한 중앙 프사)
  const bgSrc = post.photo_url ?? post.avatar_url ?? buildFallbackAvatarUrl(post.mem_id);

  // 거리·종목·날짜는 **한 줄에 묶지 않는다** — 이 자리는 "얼마나 달렸나"를 자랑하는 곳이라
  // 거리가 주인공이어야 한다. 거리를 큰 숫자로 세우고(종목 이모지·라벨은 그 옆 보조),
  // 날짜는 그 위 작은 kicker로 뺀다.
  const dateLabel = post.act_dt
    ? dayjs(post.act_dt).format("YYYY.MM.DD (ddd)")
    : null;

  return (
    <article
      ref={ref}
      className="relative flex h-full snap-start snap-always items-center justify-center overflow-hidden"
    >
      {hasPhoto ? (
        <>
          {/* 사진 뒤 블러 확장 — 세로/가로 비율이 화면과 달라 생기는 레터박스를 사진 자신의
              블러로 메운다(검은 띠 대신). object-cover라 꽉 차고, 위 또렷한 사진이 그 위에 뜬다. */}
          <Image
            src={bgSrc}
            alt=""
            fill
            sizes="100vw"
            unoptimized
            aria-hidden
            className="scale-110 object-cover opacity-40 blur-2xl"
          />
          {/* 또렷한 본 사진 — 비율 유지(contain). 무대 가운데. */}
          <Image
            src={bgSrc}
            alt={`${post.mem_nm}의 기록 사진`}
            fill
            sizes="100vw"
            unoptimized
            className="object-contain"
          />
        </>
      ) : (
        // 사진 없는 기록 — 프사 블러 무대 + 중앙 또렷 프사(격자는 꽉 채우지만 풀스크린은 세워둔다)
        <>
          <Image
            src={bgSrc}
            alt=""
            fill
            sizes="100vw"
            unoptimized
            aria-hidden
            className="scale-110 object-cover opacity-30 blur-3xl"
          />
          <div className="relative">
            <Avatar
              src={post.avatar_url}
              seed={post.mem_id}
              alt={post.mem_nm}
              size="2xl"
              className="ring-2 ring-white/20"
            />
          </div>
        </>
      )}

      {/* 하단 그라디언트 + 정보 — 사진 위로 겹쳐 오른다. pointer-events는 버튼만 받게 좁힌다.
          세로 리듬은 위계로 준다: 한마디→거리는 같은 자랑의 흐름이라 붙이고(mt-2), 거리→사람은
          정보 그룹이 바뀌므로 더 띄운다(mt-4). 균등 gap 대신 mt로 그룹을 눈에 나누게 한다. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex flex-col bg-gradient-to-t from-black/85 via-black/55 to-transparent px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-20">
        {/* 한마디 — 사람이 쓴 말이라 명조로. 릴스라 격자보다 크게(두 줄까지). */}
        {post.cmnt_txt && (
          <p className="pointer-events-auto line-clamp-3 text-balance font-serif text-[19px] font-normal leading-[1.45] text-white [overflow-wrap:anywhere] [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
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

        {/* 사람 줄 — 왼쪽 프사·이름·칭호(탭하면 프로필 카드), 오른쪽 날짜(보조).
            위 거리 그룹과는 정보가 갈리므로 더 띄운다(mt-4). */}
        <div className="mt-4 flex items-center justify-between gap-3">
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
      </div>
    </article>
  );
};
