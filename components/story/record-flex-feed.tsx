"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

import { ImageIcon, Zap } from "lucide-react";
import { toast } from "sonner";

import { loadMorePosts } from "@/app/actions/story/load-more-posts";
import { loadStoryPost } from "@/app/actions/story/load-post";
import { goToLogin } from "@/lib/auth/go-to-login";
import { clearDeepLinkParams } from "@/lib/notifications/deep-link";
// 상한은 `lib/story-post.ts`에서 가져온다 — `lib/queries/story-posts.ts`는 admin
// 클라이언트(`server-only`)를 물고 있어 클라이언트 컴포넌트가 import하면 빌드가 깨진다.
// 값 자체는 두 곳이 같아야 하므로(받은 개수 < 상한 = 끝) 정본은 story-post.ts 한 곳이다.
import { STORY_POST_LIMIT } from "@/lib/story-post";

import { EmptyState } from "@/components/common/empty-state";
import { HelpTip } from "@/components/common/help-tip";
import { MemberCardDialog } from "@/components/members/member-card-dialog";
import { RecordDeleteDialog } from "@/components/story/record-delete-dialog";
import { RecordFlexCreateDialog } from "@/components/story/record-flex-create-dialog";
import { RecordFlexEditDialog } from "@/components/story/record-flex-edit-dialog";
import { RecordReelViewer } from "@/components/story/record-reel-viewer";
import { StoryZoneHeader } from "@/components/story/story-zone-header";

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
 * **사진 없는 기록은 아예 안 뜬다.** 예전엔 프로필사진으로 칸을 채웠는데, 그러면 격자가
 * 기록이 아니라 얼굴 무더기로 읽혔다. 이 지면은 수치를 겨루는 자리가 아니라 친목·응원이고
 * 그 매개가 사진이라, 사진이 없으면 세울 것이 없다 — 거르는 건 `get_team_posts` RPC
 * (`photo_url IS NOT NULL`)라 클라이언트는 폴백을 갖지 않는다.
 *
 * 마일리지런에서 온 기록(`src_enm === "mlg_auto"`)은 사진을 올린 것만 여기 서고, 출처가
 * 다르다는 표시로 ⚡ 배지만 붙인다. 수치는 격자에 적지 않는다(칸은 사진만 담는다).
 */
export function RecordFlexFeed({
  posts,
  myMemId,
  isAdmin,
  me,
  teamId,
}: {
  posts: StoryPost[];
  /** 로그인 사용자 — 없으면 "올리기" 버튼을 감춘다(목표 한마디·응원과 동일 정책) */
  myMemId: string | null;
  /** 관리자면 남의 기록도 지울 수 있다 — 서버가 최종 방어하고 여긴 노출 판정만 */
  isAdmin?: boolean;
  /**
   * 로그인 사용자 표시정보 — 릴스 댓글의 낙관적 표시(내 이름·프사)에 쓴다.
   * 멘션 멤버 목록이 늦게 와도 내 댓글은 바로 내 얼굴로 뜬다(CommentSection 규칙).
   */
  me: { id: string; name: string; avatarUrl: string | null } | null;
  /** 릴스 뷰어 안에서 여는 프로필 카드에 넘긴다 */
  teamId: string;
}) {
  const [writing, setWriting] = useState(false);
  /** 릴스 뷰어에서 처음 열 카드 — null이면 닫힘 */
  const [openId, setOpenId] = useState<string | null>(null);

  /** 댓글 알림 딥링크(`/story?rec=<post_id>`) — 아래 `all`이 준비된 뒤 처리한다 */
  const recParam = useSearchParams().get("rec");
  /**
   * 이 post_id는 이미 열었다 — 같은 딥링크가 두 번 열리는 것만 막는 **빗장**이다.
   *
   * 화면에 안 쓰이므로 state가 아니라 ref다: effect 안에서만 읽고 쓰므로 렌더가 순수하게 남고,
   * 값이 바뀌어도 리렌더가 안 걸린다.
   *
   * **푸는 조건은 "뷰어가 닫혀 있음"이지 "주소가 비었음"이 아니다.** 예전엔 `?rec=`가 주소에서
   * 사라지면 풀었는데, 그건 자기가 방금 건 빗장을 즉시 지우는 코드였다 —
   * `clearDeepLinkParams()`가 `useSearchParams`를 **동기로** 갱신하므로(Next가 replaceState를
   * 패치) `recParam`이 곧바로 null이 되고, 같은 effect가 다시 돌며 빗장을 되돌렸다. 그때 실제로
   * "두 번 열림"을 막던 건 빗장이 아니라 `!recParam` early return이었다.
   *
   * 그래서 지금은 `openId`와 함께 본다: 같은 post_id라도 **뷰어를 이미 닫았으면**(`openId`가
   * null) 다시 연다. 이미 `/story`에 서 있는 사람이 같은 기록의 알림을 다시 누르는 경우가
   * 이것이고 — 라우트가 그대로라 컴포넌트가 안 갈아엎어진다 — 빗장만 보고 막으면 **조용히
   * 아무 일도 안 일어난다.**
   */
  const handledRecRef = useRef<string | null>(null);
  /**
   * 딥링크가 가리키는데 목록에 없어서 **따로 받아온** 한 건.
   * 격자에는 넣지 않는다(시간순 격자에 옛 기록이 끼면 순서가 깨진다) — 릴스 목록에만 얹는다.
   */
  const [deepPost, setDeepPost] = useState<StoryPost | null>(null);
  /** 이 post_id로 이미 단건 조회를 시도했나 — 실패·못찾음까지 포함해 한 번만 부른다 */
  const deepFetchedRef = useRef<string | null>(null);
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
  /** 길게 눌러 지우려는 기록 — null이면 확인 다이얼로그가 닫혀 있다 */
  const [deleting, setDeleting] = useState<StoryPost | null>(null);
  /** 한마디를 고치려는 기록 — null이면 편집 다이얼로그가 닫혀 있다 */
  const [editing, setEditing] = useState<StoryPost | null>(null);
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

  /**
   * 릴스가 훑을 목록 — 격자(`all`)에 딥링크로 따로 받아온 한 건을 얹은 것.
   *
   * 격자는 손대지 않는다: 시간순으로 흐르는 격자 한가운데에 옛 기록이 끼면 순서가 깨지고,
   * 오프셋 페이지네이션 기준(`posts.length + fetchedExtra`)도 어긋난다. 릴스는 "지금 이 장을
   * 연다"가 목적이라 목록 순서에 기대지 않으므로 여기에만 얹는다.
   *
   * 맨 앞에 둬서 열자마자 그 장이 보이게 하고, 아래로 밀면 평소 목록으로 이어진다.
   * 더보기로 같은 기록이 뒤늦게 목록에 들어오면 중복되지 않게 걸러낸다.
   */
  const reelPosts =
    deepPost && !all.some((p) => p.post_id === deepPost.post_id)
      ? [deepPost, ...all]
      : all;

  /** 딥링크 대상이 릴스 목록에 준비됐나 — 첫 묶음에 있었거나, 단건으로 받아왔거나 */
  const recReady =
    recParam != null && reelPosts.some((p) => p.post_id === recParam);

  /**
   * 댓글 알림 딥링크(`/story?rec=<post_id>`) — 그 기록을 릴스로 바로 연다.
   * 이걸 안 읽으면 알림을 눌러도 전광판 맨 위만 뜨고 정작 그 기록은 안 보인다
   * (deep-link.ts가 경고하는 "주소는 살아 있는데 화면이 안 뜨는" 상태).
   *
   * **목록에 없으면 아래 effect가 그 한 건만 따로 받아온다.** 예전엔 "못 찾으면 굳히지 않고
   * 목록에 나타나는 순간 열리게 둔다(스크롤하면 채워지니 손해가 없다)"였는데, 그 전제가
   * 틀렸다 — 알림을 눌러 들어온 사람은 스크롤할 이유를 모른다. 첫 묶음은 16건뿐이라
   * 조금만 오래된 기록이면 영영 안 열렸다(QS-13).
   *
   * ⚠️ **렌더가 아니라 effect에서 연다 — 이 파일에서 가장 미끄러운 곳이다.**
   *
   * 예전엔 이 판정을 렌더 중에 하면서 `clearDeepLinkParams()`(= `history.replaceState`)까지
   * 렌더 안에서 불렀다. 그런데 `router.push()`는 **전환(transition)**이라, 새 화면을 그리는
   * 동안 주소창은 아직 *떠나온* 페이지다. 그 타이밍에 `window.location.href`를 읽으면
   * 목적지가 아니라 **출발지**가 잡히고, 그 값으로 replaceState를 하면 `?rec=`를 지우는 게
   * 아니라 **진행 중인 이동을 출발지 주소로 덮어써 걷어찬다.**
   *
   * - 홈(`/`)에서 알림을 누르면 → 주소가 `/`로 되돌아가 홈이 다시 뜬다
   * - 일정탭에서 누르면 → 전광판은 뜨는데 `rec`이 사라져 릴스가 안 열린다
   * - 주소를 직접 입력할 때만 멀쩡했다 → 전환이 없어 출발지 = 목적지라서
   *
   * effect는 **커밋 뒤**에 돈다 = 이동이 끝나 주소가 목적지로 확정된 뒤다. 그래서 안전하다.
   * 대신 전광판이 한 프레임 보인 뒤 릴스가 덮는데, 단건 조회 경로(아래)는 원래 그랬으므로
   * 두 경로의 모양이 오히려 같아진다.
   *
   * 순서는 여전히 **지우고 → 연다**여야 한다(§clearDeepLinkParams): 뷰어가 열리며 쌓는
   * 히스토리 항목(`useDialogHistoryBack`) 위에 replaceState가 얹히면, 뒤로가기가 딥링크
   * 주소로 되돌아가 릴스가 다시 열리는 무한루프가 된다.
   */
  useEffect(() => {
    if (!recParam || !recReady) return;
    // 비로그인이 알림·공유 링크를 타고 들어온 경우 — 릴스 대신 로그인으로 보낸다(§openReel).
    // 주소의 `?rec=`은 **남겨 둔다**: 로그인 후 `/story`로 돌아오면 다시 이 자리에 서고,
    // 그때는 빗장이 풀려 그 기록이 열린다.
    if (myMemId == null) {
      goToLogin("/story");
      return;
    }
    // 같은 post_id를 이미 열었고 **아직 그 뷰어가 떠 있으면** 아무것도 안 한다.
    // 닫은 뒤(`openId === null`)라면 같은 알림을 다시 누른 것이므로 다시 연다 — 이미
    // `/story`에 서 있으면 라우트가 그대로라 컴포넌트가 안 갈아엎어지고, 빗장만 보고
    // 막으면 **조용히 무반응**이 된다(§handledRecRef).
    if (handledRecRef.current === recParam && openId !== null) return;
    handledRecRef.current = recParam;
    clearDeepLinkParams();
    setOpenId(recParam);
  }, [recParam, recReady, openId, myMemId]);

  /**
   * 목록에 없는 딥링크 — 그 한 건만 서버에서 받아온다(§loadStoryPost).
   *
   * 조회는 **한 post_id당 한 번**이다(`deepFetchedRef`). 못 찾았을 때도 굳히는 이유는,
   * 삭제된 기록이면 몇 번을 물어도 답이 같아서다 — 대신 그 사실을 토스트로 알린다.
   * 예전엔 이 경우 아무 일도 안 일어나 사용자가 원인을 알 수 없었다.
   */
  useEffect(() => {
    if (!recParam || recReady) return;
    // 비로그인은 어차피 릴스가 안 열린다(위 effect가 로그인으로 보낸다) — 보여줄 수 없는
    // 기록을 미리 받아 오지 않는다.
    if (myMemId == null) return;
    if (deepFetchedRef.current === recParam) return;
    deepFetchedRef.current = recParam;

    // 응답이 오는 사이 다른 알림으로 옮겨가면(`?rec=`가 바뀌면) 이 요청은 남의 것이 된다.
    // 그대로 반영하면 엉뚱한 기록이 릴스 앞에 얹히거나 지난 토스트가 뒤늦게 뜬다.
    let cancelled = false;

    void loadStoryPost(recParam).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        // 일시 오류는 **주소를 남겨** 둔다 — 새로고침하면 다시 시도할 수 있어야 한다.
        // `deepFetchedRef`는 풀지 않는다: 이 effect의 deps(`recParam`·`recReady`)가 그대로라
        // ref를 비워도 재실행이 안 걸려 재시도가 일어나지 않고, 나중에 더보기로 `recReady`가
        // 뒤집힐 때 중복 요청 문만 열린다. 재시도 경로는 새로고침이다.
        toast.error("기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (!res.post) {
        // 삭제됐거나 볼 수 없는 기록 — 몇 번을 물어도 답이 같으므로 **주소에서 지운다**.
        // 안 지우면 새로고침할 때마다 같은 토스트가 반복된다.
        toast.error("이미 삭제됐거나 볼 수 없는 기록이에요.");
        clearDeepLinkParams();
        return;
      }
      setDeepPost(res.post);
    });

    return () => {
      cancelled = true;
    };
  }, [recParam, recReady, myMemId]);

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

  /** 이 기록을 내가 지울 수 있나 — 내 것이거나 관리자. 서버가 다시 판정한다(§deleteRecordFlex) */
  const canDelete = (p: StoryPost) =>
    myMemId != null && (isAdmin === true || p.mem_id === myMemId);

  /**
   * 릴스 뷰어를 연다 — **비로그인이면 대신 로그인으로 보낸다.**
   *
   * 격자(사진 무더기)는 누구에게나 열어 두되, 한 장을 크게 펼치는 릴스부터는 크루원 자리다:
   * 릴스는 한마디·거리·날짜에 댓글까지 붙는 "안쪽" 지면인데, 정작 댓글은 `cmnt_mst` RLS가
   * 인증 전용이라 비로그인에게는 **영영 빈 칸**으로만 보인다. 반쯤 열어 두면 고장으로 읽히므로
   * 문턱을 문 앞에 세운다.
   *
   * 진입점이 둘(격자 탭 · 알림 딥링크)이라 **여기 한 곳**을 지나가게 한다 — 한쪽만 막으면
   * 알림을 타고 들어온 비로그인에게는 그대로 열린다.
   */
  const openReel = (postId: string) => {
    if (myMemId == null) {
      // 로그인 후 이 지면으로 돌아온다. 인앱브라우저 분기는 goToLogin이 맡는다.
      goToLogin("/story");
      return;
    }
    setOpenId(postId);
  };

  /**
   * 길게 누르기 — 500ms 눌러야 삭제 시트가 열린다.
   *
   * **가로 스크롤 지면이라 손가락이 움직이면 취소해야 한다.** 격자를 밀어 넘기는 동작이
   * 곧 포인터를 누른 채 끄는 것이라, 취소가 없으면 스크롤할 때마다 삭제창이 뜬다.
   * 10px 넘게 움직이면 "스크롤하려던 것"으로 보고 타이머를 버린다.
   *
   * 타이머가 터져 시트를 열었으면 뒤따르는 click을 삼킨다(`firedRef`) — 안 그러면 손을
   * 떼는 순간 릴스 뷰어까지 함께 열려 삭제창 위에 사진이 덮인다.
   */
  const pressRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  } | null>(null);
  const firedRef = useRef(false);

  const clearPress = () => {
    if (pressRef.current) clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };

  const startPress = (p: StoryPost) => (e: React.PointerEvent) => {
    // **권한 판정보다 먼저** 리셋한다: `firedRef`는 격자 전체가 공유하는 하나뿐이라,
    // 삭제 가능한 칸에서 길게눌러 삭제창이 뜬 뒤(true로 굳음) 그 칸의 click이 오버레이에
    // 가로막혀 리셋을 못 하면, 다음에 **권한 없는 칸**을 짧게 눌렀을 때 이 플래그가 남아
    // 그 탭까지 삼킨다(릴스가 안 열리고 한 번 더 눌러야 한다).
    firedRef.current = false;
    if (!canDelete(p)) return;
    const { clientX: x, clientY: y } = e;
    clearPress();
    pressRef.current = {
      x,
      y,
      timer: setTimeout(() => {
        firedRef.current = true;
        pressRef.current = null;
        setDeleting(p);
      }, 500),
    };
  };

  const movePress = (e: React.PointerEvent) => {
    const press = pressRef.current;
    if (!press) return;
    if (Math.abs(e.clientX - press.x) > 10 || Math.abs(e.clientY - press.y) > 10) {
      clearPress();
    }
  };

  return (
    <section className="flex flex-col">
      <StoryZoneHeader
        bleed
        label="Gingstargram"
        lead="우리가 남긴 발자국"
        action={
          <HelpTip title="깅스타그램">
            기강인들의 일상을 나누는 곳이에요. 운동이든 일상이든, 기강인의 삶을 편하게
            공유해보세요.
          </HelpTip>
        }
      />

      {/* 아직 사진이 하나도 없을 때 — 빈 가로 스크롤만 남기면 존이 고장난 것처럼 보인다.
          여기가 무엇을 하는 자리인지 한 줄로 알리고, 올리기 버튼(아래)이 행동을 받는다. */}
      {all.length === 0 ? (
        <div className="px-6 pt-4">
          <EmptyState
            variant="card"
            icon={ImageIcon}
            message="아직 올라온 사진이 없어요. 첫 사진을 올려주세요."
          />
        </div>
      ) : (
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
                  onClick={() => {
                    // 길게 눌러 삭제창을 이미 열었으면 이 click은 그 여파다 — 삼킨다.
                    if (firedRef.current) {
                      firedRef.current = false;
                      return;
                    }
                    openReel(p.post_id);
                  }}
                  onPointerDown={startPress(p)}
                  onPointerMove={movePress}
                  onPointerUp={clearPress}
                  onPointerCancel={clearPress}
                  // 길게 누르면 iOS/안드로이드가 사진 저장·복사 메뉴를 띄운다 — 우리 삭제
                  // 시트와 겹치므로 막는다. 데스크톱 우클릭도 같은 자리를 쓴다.
                  onContextMenu={(e) => {
                    if (canDelete(p)) e.preventDefault();
                  }}
                  aria-label={
                    myMemId == null
                      ? "로그인하고 기록 보기"
                      : `${p.mem_nm}의 기록 자세히 보기`
                  }
                  // 각진 정사각. 라운드를 주지 않는다(인스타 격자는 직각이 기본이고, 둥근
                  // 모서리는 칸을 카드처럼 보이게 해 격자의 결이 흐려진다). 테두리도 두지
                  // 않는다 — 인스타처럼 사진끼리 딱 붙이고, 좁은 gap(2px)이 흰 배경 사진의
                  // 경계 역할을 대신한다.
                  className="relative block aspect-square w-[42vw] max-w-[180px] overflow-hidden bg-muted transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                >
                  {/* 사진은 항상 있다 — 프사 폴백을 걷어냈다. 이 지면에 서는 조건 자체가
                      "사진이 있을 것"이고(`get_team_posts`가 사진 없는 행을 안 내려준다),
                      얼굴로 칸을 때우면 기록 격자가 아니라 얼굴 격자가 된다.
                      `photo_url`이 타입상 nullable인 건 마일리지런 자동 유입분이 사진 없이도
                      DB에 남기 때문이다 — 조회에서 걸러지므로 여기 닿지 않는다.
                      그래도 `?? ""`로 때우지는 않는다: 빈 src는 브라우저가 **현재 페이지 URL을
                      다시 요청**하게 만들어(문서를 이미지로 받으려다 실패) 깨진 아이콘이 뜬다.
                      RPC 배포 전이나 스큐가 있는 순간에도 빈 칸(bg-muted)으로 조용히 넘어가게 둔다. */}
                  {p.photo_url && (
                    <Image
                      src={p.photo_url}
                      alt=""
                      width={320}
                      height={320}
                      className="size-full object-cover"
                      referrerPolicy="no-referrer"
                      unoptimized
                    />
                  )}

                  {/* 마일리지런에서 올라온 기록 — 같은 운동기록이되 출처가 다르다는 표시만.
                      수치를 다시 적지 않는다(격자는 사진만 담는 자리다). 사진이 밝든 어둡든
                      읽히게 반투명 검정 판 위에 흰 아이콘으로 얹는다. */}
                  {p.src_enm === "mlg_auto" && (
                    <span
                      aria-label="마일리지런 기록"
                      className="pointer-events-none absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
                    >
                      <Zap className="size-3.5 fill-current" />
                    </span>
                  )}
                </button>
                ))}
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
        <div className="px-6 pt-4">
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            피드 업로드
          </button>
        </div>
      )}

      <RecordFlexCreateDialog open={writing} onOpenChange={setWriting} />

      {/* 릴스 뷰어 — 격자 한 칸을 누르면 이 장부터 풀스크린으로. 격자 목록(더보기로 이어붙인
          것까지)에 딥링크로 받아온 한 건을 얹은 `reelPosts`를 넘긴다(§reelPosts).
          프로필 카드는 story-client가 위에 겹쳐 연다. */}
      <RecordReelViewer
        posts={reelPosts}
        startId={openId}
        open={openId !== null}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
        onSelectMember={(memId, name) => setReelMember({ memId, name })}
        teamId={teamId}
        myMemId={myMemId}
        myName={me?.name}
        myAvatarUrl={me?.avatarUrl}
        isAdmin={isAdmin}
        // 릴스 ⋮ 메뉴도 같은 확인 다이얼로그를 연다(격자 길게누르기와 한 곳에서 처리).
        onRequestDelete={(p) => setDeleting(p)}
        onRequestEdit={(p) => setEditing(p)}
      />

      {/* 삭제 확인 — 격자 길게누르기와 릴스 ⋮ 메뉴가 함께 쓴다. 지운 뒤 릴스가 열려 있으면
          그 장이 사라진 목록을 보게 되므로 닫는다(router.refresh()는 다이얼로그가 부른다). */}
      <RecordDeleteDialog
        post={deleting}
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        onDeleted={() => setOpenId(null)}
      />

      {/* 한마디 수정 — 릴스 연필에서만 연다. 삭제와 달리 **릴스를 닫지 않는다**: 고친 한마디는
          그 장에 그대로 남으므로 보던 사진으로 돌아오는 게 맞다(refresh는 다이얼로그가 부른다). */}
      <RecordFlexEditDialog
        post={editing}
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        // 클라이언트가 들고 있는 목록(더보기로 이어붙인 것·딥링크 단건)에도 반영한다 —
        // 저쪽은 `router.refresh()`가 닿지 않아 그냥 두면 방금 고친 한마디가 릴스에
        // 옛 값으로 남는다. 서버 첫 묶음(`posts`)은 refresh가 알아서 갱신한다.
        onSaved={(postId, cmntTxt) => {
          setExtra((prev) =>
            prev.map((p) => (p.post_id === postId ? { ...p, cmnt_txt: cmntTxt } : p)),
          );
          setDeepPost((prev) =>
            prev && prev.post_id === postId ? { ...prev, cmnt_txt: cmntTxt } : prev,
          );
        }}
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
