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

// 종목 라벨은 lib/sport.ts(개인 운동 종목 공통 상수)의 getSportLabel을 쓴다 — 대회 종목과
// 섞였던 옛 맵은 제거했다(post_mst의 옛 road_run 값은 데이터 이전으로 RUNNING으로 정리).

/**
 * 운동 기록 슬롯의 진입 랜덤 인덱스를 뽑는다(0 ~ count-1). count가 0/1이면 0.
 *
 * 서버 컴포넌트 렌더에서 `Math.random()`을 직접 부르면 react-hooks/purity 룰이 막는다
 * (렌더는 순수해야 한다는 규칙 — 서버 컴포넌트에도 적용된다). 실제로는 서버 요청마다 한 번
 * 뽑는 게 의도지만, 그 비순수 호출을 렌더 본문 밖 이 헬퍼로 빼 룰과 충돌하지 않게 한다.
 */
export function pickRandomPostIndex(count: number): number {
  if (count <= 1) return 0;
  return Math.floor(Math.random() * count);
}

/**
 * 활동지수 슬롯의 대표 진입 인덱스를 뽑는다 — **상위 3명 중 하나**(0~2). 1등만 세우면
 * 재미가 없어 1·2·3등 중에서 새로고침·한 바퀴마다 굴린다. 표본이 얇으면(2명→0~1,
 * 1명→0) 있는 만큼만 범위를 좁힌다. `pickRandomPostIndex`와 같은 이유로 렌더 밖에서 뽑는다.
 */
export function pickActvLeadIndex(rankLen: number): number {
  const cap = Math.min(3, rankLen);
  if (cap <= 1) return 0;
  return Math.floor(Math.random() * cap);
}

/**
 * 현상수배존의 정렬 시드를 뽑는다 — 진입마다 다른 얼굴 조합이 앞에 서게.
 *
 * 대상이 30명 상한보다 많아(운영계 44명) 순서가 곧 "누가 뜨느냐"다. 오래된 순으로 두면
 * 최고참 실종자만 영구 박제되고 뒷사람은 영영 안 나오므로 RPC에서 시드 랜덤으로 뽑는다.
 *
 * DB에서 `random()`을 쓰지 않고 **시드를 서버가 넘기는** 이유: 이 조회는 캐시가 없어
 * (`getGhostMembers`) 매 요청 실행되는데, DB 랜덤이면 한 진입 안에서도 재조회마다 순서가
 * 튄다 — 가로 스크롤 도중 얼굴이 바뀐다. 시드가 고정이면 그 진입 동안은 순서가 안 흔들린다.
 *
 * `pickRandomPostIndex`와 같은 이유로 렌더 본문 밖(이 헬퍼)에서 뽑는다.
 */
export function pickGhostSeed(): string {
  return Math.random().toString(36).slice(2);
}
