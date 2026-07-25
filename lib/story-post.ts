/**
 * 기록 자랑 표시 상수 — **클라이언트가 읽어도 되는 것만** 둔다.
 *
 * 조회 쪽(`lib/queries/story-posts.ts`)은 `createAdminClient`를 타고 `server-only`에 닿는
 * 서버 모듈이라, 거기서 상수 하나만 가져와도 클라이언트 번들이 서버 모듈을 통째로 끌어와
 * 런타임에 터진다("'server-only' cannot be imported from a Client Component").
 * 타입체크·빌드는 통과하고 **브라우저에서만** 드러나는 종류라 이렇게 갈라 둔다.
 *
 * 같은 이유로 `story-reaction.ts`·`story-pledge.ts`도 쿼리 파일과 분리돼 있다.
 */

/**
 * 한 번에 받아오는 기록 수.
 *
 * 첫 화면(`getStoryPosts`)과 이어붙이기(`loadMorePosts`)가 **같은 값을 쓴다** — 받은 개수가
 * 이 값보다 적으면 "끝"으로 판정하기 때문에, 둘이 갈리면 마지막 묶음을 끝으로 오인한다.
 *
 * 16인 이유는 요청 횟수와 응답 크기의 절충이다. 한 열이 2장이니 8열 — 한 번 받으면 한참
 * 밀 수 있다. 4건(2열)이면 화면에 보이는 만큼만 받는 셈이라 밀 때마다 요청이 붙어
 * 스크롤이 끊긴다. 반대로 크게 잡으면 첫 진입에 안 볼 사진의 URL까지 들고 온다.
 */
export const STORY_POST_LIMIT = 16;
