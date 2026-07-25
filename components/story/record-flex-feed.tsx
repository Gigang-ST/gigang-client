"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { loadMorePosts } from "@/app/actions/story/load-more-posts";
import { MILEAGE_SPORT_LABELS, type MileageSport } from "@/lib/mileage";
// 상한은 `lib/story-post.ts`에서 가져온다 — `lib/queries/story-posts.ts`는 admin
// 클라이언트(`server-only`)를 물고 있어 클라이언트 컴포넌트가 import하면 빌드가 깨진다.
// 값 자체는 두 곳이 같아야 하므로(받은 개수 < 상한 = 끝) 정본은 story-post.ts 한 곳이다.
import { STORY_POST_LIMIT } from "@/lib/story-post";

import { buildFallbackAvatarUrl } from "@/components/common/avatar";
import { RecordFlexCreateDialog } from "@/components/story/record-flex-create-dialog";

import type { StoryPost } from "@/lib/queries/story-posts";

/** 종목 라벨 — 마일리지런과 같은 어휘를 쓴다(자동 유입분과 표기가 갈리지 않게) */
function sportLabel(sprt: string | null): string | null {
  if (!sprt) return null;
  return MILEAGE_SPORT_LABELS[sprt as MileageSport] ?? null;
}

/** 거리 표기 — numeric이 10.20으로 와도 10.2로 줄인다(뒤 0은 정보가 아니다) */
function formatKm(km: number | null): string | null {
  if (km == null || Number.isNaN(km)) return null;
  return `${Number(km.toFixed(2))}km`;
}

/**
 * 기록 자랑 — 인스타 피드형 격자.
 *
 * 사진(정사각) 아래 **한마디 한 줄 + 기록 한 줄**을 세우고, 세로 2칸을 한 열로 묶어
 * **가로로 계속 흘려보낸다.** 폴라로이드(기울인 흰 판에 이름·날짜까지)였던 걸 걷어냈다 —
 * 칸마다 네 줄이 들어가니 정작 사진이 작아지고, 격자가 사진이 아니라 종이 무더기로 읽혔다.
 *
 * **면 넘기기와 진행 막대를 버렸다.** 막대는 기록이 늘수록 한 칸이 좁아져 결국 못 누르는
 * UI가 되고(400건이면 3px), 시간순 목록에서 "몇 면 중 몇 면"은 애초에 쓸모가 적다.
 * 지금은 손으로 밀면 계속 흘러가고 끝에서 멈춘다 — 감기지 않으므로 끝이 있다는 걸 손으로 안다.
 *
 * **이름·날짜를 뺀 게 핵심이다.** 격자에서 눈에 들어오는 건 사진과 기록이고, 누가 언제인지는
 * 눌러서 확인할 정보다. 두 줄 안에 넷을 다 넣으면 결국 아무것도 안 읽힌다.
 * 한마디도 한 줄로 자른다(두 줄까지 열면 칸마다 높이가 달라져 격자가 어긋난다).
 *
 * **사진이 없는 기록**(직접 올리며 사진을 안 넣었거나, 마일리지런 자동 유입분 `mlg_auto` —
 * 원천 `evt_mlg_act_hist`에 사진 컬럼이 없다)은 **프로필사진을 칸에 사각으로 꽉 채운다**.
 * 동그란 아바타 + 가운데 한마디였던 걸 걷어냈다 — 사진 있는 칸과 같은 사각 격자로 읽히게.
 * 사진을 안 올리는 사람이 훨씬 많을 텐데 빈 회색 칸으로 두면 자랑이 초라해 보여 다음부터
 * 안 올린다. 프사가 512px라 확대하면 다소 흐리지만, 얼굴이 보이는 편이 낫다는 판단.
 */
export function RecordFlexFeed({
  posts,
  myMemId,
}: {
  posts: StoryPost[];
  /** 로그인 사용자 — 없으면 "올리기" 버튼을 감춘다(각오·응원과 동일 정책) */
  myMemId: string | null;
}) {
  const [writing, setWriting] = useState(false);
  /** 서버가 준 첫 묶음 뒤로 이어붙인 것들 */
  const [extra, setExtra] = useState<StoryPost[]>([]);
  /** 더 남았나 — 받은 개수가 요청량보다 적으면 끝이다 */
  const [done, setDone] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // 서버 데이터가 **내용상** 바뀌면(작성·Realtime 갱신) 이어붙인 건 버린다 — 앞이 바뀐 채로
  // 뒤를 유지하면 오프셋이 어긋나 같은 기록이 두 번 보인다.
  //
  // 배열 자체(`posts`)로 비교하면 안 된다: 서버 렌더마다 새 참조가 와서 내용이 같아도
  // 매번 초기화되고, 그러면 스크롤 도중 이어붙인 게 통째로 사라진다.
  //
  // effect가 아니라 **렌더 중 비교**로 처리한다. effect에서 setState하면 이어붙인 걸 한 번
  // 그린 뒤 지우는 캐스케이드 렌더가 되고(그 사이 프레임에 옛 목록이 보인다), 린트도 막는다.
  // React 공식 권장 패턴("You Might Not Need an Effect" — prop이 바뀌면 렌더 중 조정).
  const postsKey = `${posts.length}:${posts[0]?.post_id ?? ""}`;
  const [seenKey, setSeenKey] = useState(postsKey);
  if (seenKey !== postsKey) {
    setSeenKey(postsKey);
    setExtra([]);
    setDone(false);
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
        void loadMorePosts(posts.length + extra.length)
          .then((more) => {
            // 받은 개수로 끝을 판정한다 — 아래 중복 제거로 화면 개수가 줄어도, "끝"은
            // 서버가 실제로 준 양(more.length)으로 봐야 한다(걸러진 뒤 길이로 보면 중복이
            // 많은 묶음을 끝으로 오인해 조기 종료된다).
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
  }, [posts.length, extra.length, done]);

  const hasPosts = all.length > 0;
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
      <p className="px-6 pt-2.5 font-serif text-[15px] text-muted-foreground">
        {hasPosts
          ? "기강인들이 남긴 기록"
          : "아직 올라온 기록이 없어요 — 오늘 뛴 기록을 남겨보세요"}
      </p>

      {hasPosts && (
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
          className="scrollbar-none snap-x snap-proximity scroll-pl-6 overflow-x-auto overscroll-x-contain pt-4"
        >
          <ul className="lede-in flex w-max gap-1.5 px-6">
            {columns.map((col, ci) => (
              <li key={ci} className="flex snap-start flex-col gap-1.5">
                {col.map((p) => {
              const label = sportLabel(p.sprt_enm);
              const km = formatKm(p.dst_km);
              return (
                /* 폭 고정 — 가로 흐름이라 화면 폭의 절반쯤에 맞춰 "한 화면에 두 열"이
                   보이게 한다(다음 열이 살짝 걸쳐 더 있다는 걸 알린다). */
                <div key={p.post_id} className="flex w-[42vw] max-w-[180px] flex-col gap-1">
                  {/* 사진 — 각진 정사각. 라운드를 주지 않는다(인스타 격자는 직각이 기본이고,
                      둥근 모서리는 칸을 카드처럼 보이게 해 격자의 결이 흐려진다).
                      배경이 흰 사진도 칸 경계가 보이도록 얇은 테두리를 두른다. */}
                  <span className="block aspect-square w-full overflow-hidden border border-border bg-muted">
                    {/* 사진 없이 올린 기록도 프로필사진을 **칸에 사각으로 꽉 채운다** —
                        동그란 아바타 + 가운데 한마디였던 걸 걷어냈다. 사진 있는 칸과 같은
                        aspect-square·object-cover라 격자가 한 결로 읽힌다(칸이 카드처럼
                        따로 놀지 않는다). 프사가 512px라 확대하면 다소 흐리지만, 회색 빈
                        칸보다 얼굴이 보이는 편이 자랑 피드로선 낫다. 프사 미설정자는
                        DiceBear 폴백(SVG)이라 오히려 선명하다. 한마디는 사진 있는 칸과
                        똑같이 아래 줄에 두고, 이름은 넣지 않는다(누구인지는 눌러서 본다). */}
                    <Image
                      src={p.photo_url ?? p.avatar_url ?? buildFallbackAvatarUrl(p.mem_id)}
                      alt=""
                      width={320}
                      height={320}
                      className="size-full object-cover"
                      referrerPolicy="no-referrer"
                      unoptimized
                    />
                  </span>

                  {/* 한마디 — 사진 바로 아래 한 줄. 길이가 달라도 격자가 어긋나지 않게
                      한 줄로 자른다(두 줄까지 열면 칸마다 높이가 달라진다).
                      리디바탕(`font-serif`) — 사람이 쓴 말이라 본문 산세리프와 결을 나눈다.
                      사진 유무와 무관하게 한마디를 쓴다 — 이제 사진 없는 칸도 사각 프사로
                      꽉 차 있어 한마디가 칸 안에 따로 들어가지 않는다. */}
                  <span className="truncate font-serif text-[13px] leading-snug text-foreground">
                    {p.cmnt_txt}
                  </span>

                  {/* 기록 — 거리 · 종목. 이름·날짜는 뺐다(격자에서 읽히는 건 사진과 기록이고,
                      누가 언제인지는 눌러서 볼 정보라 두 줄 안에 다 넣으면 아무것도 안 읽힌다) */}
                  <span className="font-numeric text-[11px] text-muted-foreground tabular-nums">
                    {[km, label].filter(Boolean).join(" · ") || "―"}
                  </span>
                </div>
                  );
                })}
              </li>
            ))}

            {/* 오른쪽 끝 sentinel — 여기가 보이면 다음 묶음을 받는다. 폭 1px짜리 빈 칸이라
                보이지 않지만, 끝까지 다 받았으면(`done`) 아예 렌더하지 않아 관찰도 멈춘다. */}
            {!done && <li ref={sentinelRef} aria-hidden className="w-px shrink-0" />}
          </ul>
        </div>
      )}

      {/* 기록 올리기 — 로그인 멤버만 */}
      {myMemId && (
        <div className={hasPosts ? "px-6 pt-4" : "px-6 pt-5"}>
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
    </section>
  );
}
