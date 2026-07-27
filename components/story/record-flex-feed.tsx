"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { loadMorePosts } from "@/app/actions/story/load-more-posts";
// 상한은 `lib/story-post.ts`에서 가져온다 — `lib/queries/story-posts.ts`는 admin
// 클라이언트(`server-only`)를 물고 있어 클라이언트 컴포넌트가 import하면 빌드가 깨진다.
// 값 자체는 두 곳이 같아야 하므로(받은 개수 < 상한 = 끝) 정본은 story-post.ts 한 곳이다.
import { STORY_POST_LIMIT } from "@/lib/story-post";

import { buildFallbackAvatarUrl } from "@/components/common/avatar";
import { MemberCardDialog } from "@/components/members/member-card-dialog";
import { RecordFlexCreateDialog } from "@/components/story/record-flex-create-dialog";
import { RecordReelViewer } from "@/components/story/record-reel-viewer";

import type { StoryPost } from "@/lib/queries/story-posts";

/**
 * 기록 자랑 — 인스타 게시글형 격자.
 *
 * 칸은 **사진만** 담는다(인스타 게시글 격자처럼). 세로 2칸을 한 열로 묶어 **가로로 계속
 * 흘려보내고**, 한마디·거리·날짜는 칸을 눌러 릴스 뷰어(`RecordReelViewer`)에서 본다.
 * 예전엔 사진 아래 한마디·기록을 얹었는데, 칸마다 텍스트가 들어가니 정작 사진이 작아지고
 * 격자가 사진이 아니라 종이 무더기로 읽혔다 — 사진만 남겨 무더기가 사진으로 읽히게 한다.
 *
 * **면 넘기기와 진행 막대를 버렸다.** 막대는 기록이 늘수록 한 칸이 좁아져 결국 못 누르는
 * UI가 되고(400건이면 3px), 시간순 목록에서 "몇 면 중 몇 면"은 애초에 쓸모가 적다.
 * 지금은 손으로 밀면 계속 흘러가고 끝에서 멈춘다 — 감기지 않으므로 끝이 있다는 걸 손으로 안다.
 *
 * **사진이 없는 기록**(직접 올리며 사진을 안 넣었거나, 마일리지런 자동 유입분 `mlg_auto` —
 * 원천 `evt_mlg_act_hist`에 사진 컬럼이 없다)은 **프로필사진을 칸에 사각으로 꽉 채운다**.
 * 사진 있는 칸과 같은 사각 격자로 읽히게 — 빈 회색 칸으로 두면 자랑이 초라해 보여 다음부터
 * 안 올린다. 프사가 512px라 확대하면 다소 흐리지만, 얼굴이 보이는 편이 낫다는 판단.
 */
export function RecordFlexFeed({
  posts,
  myMemId,
  teamId,
}: {
  posts: StoryPost[];
  /** 로그인 사용자 — 없으면 "올리기" 버튼을 감춘다(각오·응원과 동일 정책) */
  myMemId: string | null;
  /** 릴스 뷰어 안에서 여는 프로필 카드에 넘긴다 */
  teamId: string;
}) {
  const [writing, setWriting] = useState(false);
  /** 릴스 뷰어에서 처음 열 카드 — null이면 닫힘 */
  const [openId, setOpenId] = useState<string | null>(null);
  /**
   * 릴스 뷰어에서 이름·프사를 눌러 여는 프로필 카드 — 뷰어 위에 겹친다(stacked).
   * story-client의 공유 카드와 **분리**한다: 저 카드는 여러 진입점이 z-50로 공유하는데,
   * 릴스 뷰어(z-50) 위에 뜨려면 z-[60]이 필요해 stacked를 켜야 한다. 뷰어가 자기 카드를
   * 직접 들고 있어야 이 차이를 격리할 수 있다(공유 카드를 항상 stacked로 두면 다른 진입점이
   * 깨진다).
   */
  const [reelMember, setReelMember] = useState<{ memId: string; name: string } | null>(
    null,
  );
  /** 서버가 준 첫 묶음 뒤로 이어붙인 것들 */
  const [extra, setExtra] = useState<StoryPost[]>([]);
  /** 더 남았나 — 받은 개수가 요청량보다 적으면 끝이다 */
  const [done, setDone] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // **오프셋은 서버에서 실제로 받은 누적 개수로 센다** — 화면 개수(posts+extra)로 계산하면
  // 중복으로 버려진 항목만큼 오프셋이 서버 위치보다 뒤처져, 한 묶음이 통째로 중복이면
  // 같은 구간을 무한히 다시 받아 더보기가 멈춘다. 첫 묶음(posts.length) 이후 서버가 준
  // 누적 개수(중복 제거 전)를 따로 센다 — 실제 오프셋은 `posts.length + fetchedExtra`.
  const [fetchedExtra, setFetchedExtra] = useState(0);

  // 서버 데이터가 **내용상** 바뀌면(작성·Realtime 갱신) 이어붙인 건 버린다 — 앞이 바뀐 채로
  // 뒤를 유지하면 오프셋이 어긋나 같은 기록이 두 번 보인다.
  //
  // 배열 자체(`posts`)로 비교하면 안 된다: 서버 렌더마다 새 참조가 와서 내용이 같아도
  // 매번 초기화되고, 그러면 스크롤 도중 이어붙인 게 통째로 사라진다.
  //
  // effect가 아니라 **렌더 중 비교**로 처리한다. effect에서 setState하면 이어붙인 걸 한 번
  // 그린 뒤 지우는 캐스케이드 렌더가 되고(그 사이 프레임에 옛 목록이 보인다), 린트도 막는다.
  // React 공식 권장 패턴("You Might Not Need an Effect" — prop이 바뀌면 렌더 중 조정).
  // 길이 + 첫·마지막 id로 내용 변화를 식별한다 — 길이가 같은 채 중간이 갈리고 끝이 바뀌는
  // 경우(한 건 삭제 + 한 건 추가)까지 대부분 덮는다. 첫 id만 보면 그 경우를 놓친다.
  const postsKey = `${posts.length}:${posts[0]?.post_id ?? ""}:${posts.at(-1)?.post_id ?? ""}`;
  const [seenKey, setSeenKey] = useState(postsKey);
  if (seenKey !== postsKey) {
    setSeenKey(postsKey);
    setExtra([]);
    setDone(false);
    // 첫 묶음이 바뀌었으니 누적 수신량도 0으로 되돌린다(오프셋 기준은 posts.length로 재설정)
    setFetchedExtra(0);
  }

  // 오프셋 페이지네이션이라, 첫 렌더 뒤 새 기록이 상단에 꽂히면(act_dt DESC) 오프셋이
  // 밀려 이미 본 카드가 한 번 더 올 수 있다. seenKey 리셋은 posts 내용이 바뀐 *뒤*에만
  // 걸려 그 사이 in-flight 구간을 못 덮는다. 그래서 화면을 그릴 때 post_id로 한 번 더
  // 좁힌다 — 서버 첫 묶음(posts)을 진실로 두고, 이어붙인 것 중 겹치는 id만 버린다.
  // (누락은 offset 방식의 본질적 한계라 다음 refresh에 복구되지만, 더 거슬리는 중복은 없앤다.)
  const all = (() => {
    if (extra.length === 0) return posts;
    const seen = new Set(posts.map((p) => p.post_id));
    return [...posts, ...extra.filter((p) => !seen.has(p.post_id))];
  })();

  /** 오른쪽 끝 sentinel이 보이면 다음 묶음 — 캘린더 리스트뷰와 같은 장치(방향만 가로) */
  useEffect(() => {
    const target = sentinelRef.current;
    const root = scrollerRef.current;
    if (!target || !root || done) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (loadingRef.current) return;
        loadingRef.current = true;
        // 오프셋 = 첫 묶음 + 서버 누적 수신량. 화면 개수가 아니라(중복 제거로 갈린다).
        void loadMorePosts(posts.length + fetchedExtra)
          .then((res) => {
            // 실패는 "끝"으로 굳히지 않는다 — done을 안 걸어 두면 sentinel이 남아, 다음
            // 스크롤·재교차에 콜백이 다시 발화해 자연히 재시도된다.
            if (!res.ok) return;

            const more = res.posts;
            // 서버가 실제로 준 양을 누적 오프셋에 더한다(중복으로 걸러지기 전 개수).
            if (more.length > 0) setFetchedExtra((n) => n + more.length);
            // 받은 개수로 끝을 판정한다 — 아래 중복 제거로 화면 개수가 줄어도, "끝"은
            // 서버가 실제로 준 양(more.length)으로 봐야 한다.
            if (more.length === 0 || more.length < STORY_POST_LIMIT) setDone(true);
            if (more.length > 0) {
              // 오프셋이 밀려 이미 담은 것과 겹쳐 와도 append하지 않는다(중복 방지).
              setExtra((prev) => {
                const seen = new Set([
                  ...posts.map((p) => p.post_id),
                  ...prev.map((p) => p.post_id),
                ]);
                const fresh = more.filter((p) => !seen.has(p.post_id));
                return fresh.length > 0 ? [...prev, ...fresh] : prev;
              });
            }
          })
          .finally(() => {
            loadingRef.current = false;
          });
      },
      // 끝에 완전히 닿기 전에 미리 받아둔다 — 닿고 나서 받으면 빈 자리를 보게 된다
      { root, rootMargin: "0px 240px 0px 0px", threshold: 0 },
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [posts, extra.length, fetchedExtra, done]);

  // 2장씩 한 열 — 가로로 흐르는 격자라 세로 2칸을 채우고 다음 열로 넘어간다
  const columns: StoryPost[][] = [];
  for (let i = 0; i < all.length; i += 2) {
    columns.push(all.slice(i, i + 2));
  }

  return (
    <section className="flex flex-col">
      <div className="rule-section mx-6 flex items-center justify-between gap-2 pb-2">
        <h2 className="font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
          Record Board
        </h2>
      </div>
      <p className="px-6 pt-2.5 text-[15px] text-muted-foreground">
        우리가 남긴 발자국
      </p>

      {
        /* 가로 스크롤 — 면을 끊어 넘기던 걸(프로그레스바 + 스와이프 판정) 걷어내고 손으로
           밀면 계속 흘러가게 했다. 면 표시 막대는 기록이 늘수록 한 칸이 좁아져 결국 못 누르는
           UI가 되는데, 여기는 시간순 목록이라 "몇 면 중 몇 면"이 애초에 쓸모가 적다.

           `snap-x`로 열 단위에 살짝 걸리게만 둔다 — 자유 스크롤은 칸이 반쯤 잘린 채 멈춰
           격자가 흐트러지고, `mandatory`로 강제하면 관성이 죽어 뻑뻑해진다.

           **`scroll-pl-6`이 핵심이다**: `snap-start`는 스크롤 컨테이너의 진짜 왼쪽 끝(0px)에
           칸을 붙이므로, 안쪽 `px-6`은 스냅 기준 밖이라 첫 열이 지면 좌측 정렬선보다
           24px 왼쪽으로 밀려 보인다. 스냅 기준선 자체를 패딩만큼 밀어야 다른 존과 줄이 맞는다. */
        <div
          ref={scrollerRef}
          // 키보드·스크린리더도 방향키로 훑을 수 있게 포커스 가능한 영역으로 둔다 —
          // 칸 안에 포커스 요소가 없어(사진·텍스트뿐) 이걸 안 주면 처음 두 열 뒤로는
          // 키보드로 닿을 방법이 없고 이어붙이기 sentinel도 트리거되지 않는다.
          tabIndex={0}
          role="region"
          aria-label="기록 자랑 목록 — 좌우로 스크롤"
          className="scrollbar-none snap-x snap-proximity scroll-pl-6 overflow-x-auto overscroll-x-contain pt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ul className="lede-in flex w-max gap-0.5 px-6">
            {columns.map((col, ci) => (
              <li key={ci} className="flex snap-start flex-col gap-0.5">
                {col.map((p) => (
                /* 폭 고정 — 가로 흐름이라 화면 폭의 절반쯤에 맞춰 "한 화면에 두 열"이
                   보이게 한다(다음 열이 살짝 걸쳐 더 있다는 걸 알린다).
                   칸은 **사진만** 담는다(인스타 게시글 격자처럼) — 한마디·거리·날짜는 눌러서
                   릴스 뷰어에서 본다. 격자에 텍스트를 얹으면 사진이 작아지고 무더기가 종이처럼
                   읽힌다. 칸 전체가 버튼 — 누르면 릴스 뷰어가 이 장부터 열린다. */
                <button
                  key={p.post_id}
                  type="button"
                  onClick={() => setOpenId(p.post_id)}
                  aria-label={`${p.mem_nm}의 기록 자세히 보기`}
                  // 각진 정사각. 라운드를 주지 않는다(인스타 격자는 직각이 기본이고, 둥근
                  // 모서리는 칸을 카드처럼 보이게 해 격자의 결이 흐려진다). 테두리도 두지
                  // 않는다 — 인스타처럼 사진끼리 딱 붙이고, 좁은 gap(2px)이 흰 배경 사진의
                  // 경계 역할을 대신한다.
                  className="block aspect-square w-[42vw] max-w-[180px] overflow-hidden bg-muted transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                >
                  {/* 사진 없이 올린 기록도 프로필사진을 **칸에 사각으로 꽉 채운다** — 사진 있는
                      칸과 같은 aspect-square·object-cover라 격자가 한 결로 읽힌다(칸이 카드처럼
                      따로 놀지 않는다). 프사가 512px라 확대하면 다소 흐리지만, 회색 빈 칸보다
                      얼굴이 보이는 편이 자랑 피드로선 낫다. 프사 미설정자는 DiceBear 폴백(SVG)이라
                      오히려 선명하다. */}
                  <Image
                    src={p.photo_url ?? p.avatar_url ?? buildFallbackAvatarUrl(p.mem_id)}
                    alt=""
                    width={320}
                    height={320}
                    className="size-full object-cover"
                    referrerPolicy="no-referrer"
                    unoptimized
                  />
                </button>
                ))}
              </li>
            ))}

            {/* 오른쪽 끝 sentinel — 여기가 보이면 다음 묶음을 받는다. 폭 1px짜리 빈 칸이라
                보이지 않지만, 끝까지 다 받았으면(`done`) 아예 렌더하지 않아 관찰도 멈춘다. */}
            {!done && <li ref={sentinelRef} aria-hidden className="w-px shrink-0" />}
          </ul>
        </div>
      }

      {/* 기록 올리기 — 로그인 멤버만 */}
      {myMemId && (
        <div className="px-6 pt-4">
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            내 기록 공유하기
          </button>
        </div>
      )}

      <RecordFlexCreateDialog open={writing} onOpenChange={setWriting} />

      {/* 릴스 뷰어 — 격자 한 칸을 누르면 이 장부터 풀스크린으로. 격자와 같은 `all`을 넘겨
          더보기로 이어붙인 것까지 순서 그대로 넘긴다. 프로필 카드는 story-client가 위에 겹쳐 연다. */}
      <RecordReelViewer
        posts={all}
        startId={openId}
        open={openId !== null}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
        onSelectMember={(memId, name) => setReelMember({ memId, name })}
      />

      {/* 릴스 뷰어 위에 겹쳐 뜨는 프로필 카드(stacked=z-[60]) — 뷰어를 닫지 않고 그 위에 얹는다.
          카드를 닫으면 뷰어로 돌아온다(릴스는 그대로). */}
      <MemberCardDialog
        memId={reelMember?.memId ?? null}
        memNm={reelMember?.name}
        teamId={teamId}
        open={reelMember !== null}
        onOpenChange={(o) => {
          if (!o) setReelMember(null);
        }}
        isOwner={reelMember?.memId != null && reelMember.memId === myMemId}
        stacked
      />
    </section>
  );
}
