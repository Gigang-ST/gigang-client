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
 * 오래된 순으로 두면 최고참 실종자만 영구 박제되고 뒷사람은 영영 안 나오므로 매 진입
 * 조합을 새로 뽑는다. 섞는 건 **`arrangeGhosts`(lib/ghost-members.ts)** 다 — 예전엔 RPC의
 * `ORDER BY md5(mem_id || seed)`였는데, 시드가 인자로 들어가면 캐시 키가 매번 달라져
 * 캐시를 못 걸었다. 필터만 캐시하고 순서는 JS로 옮겨 둘 다 얻었다(§getGhostCandidates).
 *
 * 진입 안에서 **고정된 시드**를 쓰는 이유(DB `random()`이나 매번 새 난수가 아니라): 한 진입
 * 동안 재조회·리렌더가 나도 순서가 안 흔들려야 한다 — 가로 스크롤 도중 얼굴이 바뀌면 안 된다.
 *
 * ⚠️ 한때 여기 "대상이 30명 상한보다 많아(운영계 44명) 순서가 곧 누가 뜨느냐"라고 적혀
 * 있었는데 **지금은 후보가 27명**이라 상한에 안 걸린다(2026-09-18 실측). 전원이 매번 뜨고
 * 시드가 정하는 건 *순서*뿐이다. 후보가 다시 30을 넘으면 그때 "누가 뜨느냐"가 된다.
 *
 * `pickRandomPostIndex`와 같은 이유로 렌더 본문 밖(이 헬퍼)에서 뽑는다.
 */
export function pickGhostSeed(): string {
  return Math.random().toString(36).slice(2);
}

/**
 * 격자 칸에 찍을 댓글 수 — 서버가 준 값 위에 릴스에서 실측한 값을 덮는다.
 *
 * **왜 오버레이가 필요한가**: `getStoryPosts`가 5분 캐시(`revalidate: 300`)라, 댓글을 달고
 * 시트를 닫으면 격자 숫자가 한동안 옛 값으로 남는다 — 응원 버튼에서 이미 겪은
 * "눌러도 반영이 안 된다"와 같은 오독이다. 그렇다고 `revalidateTag("story-posts")`를 부를
 * 수는 없다(댓글 한 건이 격자 캐시 전체를 날린다 — 응원이 태그를 안 터는 것과 같은 이유).
 * 릴스가 이미 Realtime으로 들고 있는 개수를 클라이언트에서 덮어 쓰는 쪽이 싸고 정확하다.
 *
 * ⚠️ **`??`여야 한다. `||`로 쓰면 안 된다** — override가 `0`(댓글을 다 지운 직후)일 때
 * falsy라 서버의 옛 값으로 되돌아가, 지웠는데 숫자가 남는다. 이 함수가 따로 있는 이유가
 * 그 한 글자다(회귀 테스트: `lib/__tests__/story-post.test.ts`).
 *
 * @param server  RPC(`get_team_posts`)의 `cmnt_cnt`. 마이그레이션 전 응답엔 없다(undefined)
 * @param override 릴스에서 실측한 개수. 아직 그 칸을 안 열었으면 undefined
 */
export function resolveCommentCount(
  server: number | undefined,
  override: number | undefined,
): number {
  const raw = override ?? server ?? 0;
  return Math.max(0, Math.floor(raw));
}
