"use server";

import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORY_POST_LIMIT } from "@/lib/story-post";
import type { StoryPost } from "@/lib/queries/story-posts";

/**
 * 오프셋 상한 — 비로그인도 호출 가능한 공개 액션이라, 임의로 큰 오프셋으로 DB를 긁게
 * 두지 않는다. Postgres OFFSET은 건너뛴 행까지 스캔하므로 `p_offset = 1e9`를 연타하면
 * 값싸게 CPU를 태울 수 있다. 실제 기록 수를 넉넉히 넘는 선(2000)에서 자른다.
 */
const MAX_OFFSET = 2000;

/**
 * 더 불러오기 결과 — **실패와 "끝"을 구분한다.**
 * 둘 다 빈 배열로 뭉개면 일시 오류 한 번이 그 세션의 영구 종료로 굳는다(호출부가
 * 빈 응답을 "끝"으로 보고 sentinel을 떼기 때문). `ok: false`면 호출부가 재시도할 수 있다.
 */
export type LoadMoreResult =
  | { ok: true; posts: StoryPost[] }
  | { ok: false };

/**
 * 기록 자랑 더 불러오기 — 가로 스크롤 끝에 닿으면 다음 묶음을 이어붙인다.
 *
 * **`getStoryPosts`(캐시 조회)와 나눠 둔 이유**: 저건 `unstable_cache`로 감싼 첫 화면용이라
 * 태그 무효화 주기를 갖는다. 이어붙이기는 사용자가 민 만큼만 도는 호출이라 캐시에 얹을
 * 이유가 없고(오프셋마다 캐시 키가 갈려 적중률도 낮다), 오히려 캐시가 끼면 새 기록이
 * 올라온 뒤 오프셋이 밀려 같은 항목이 두 번 나온다.
 *
 * 공개 데이터라 로그인을 요구하지 않는다 — 비로그인도 지면을 읽을 수 있어야 하고,
 * 첫 16건을 이미 본 사람에게 17번째부터 로그인을 요구할 근거가 없다.
 *
 * 정렬은 RPC가 첫 조회와 동일하게 잡는다(act_dt DESC, crt_at DESC). 정렬이 갈리면
 * 오프셋이 무의미해져 중복·누락이 생긴다.
 */
export async function loadMorePosts(offset: number): Promise<LoadMoreResult> {
  // 음수·비정수 오프셋은 조용히 0으로, 상한을 넘으면 상한으로 — 클라이언트가 보낸 값이라
  // 그대로 믿지 않는다. 상한에 걸리면 그 너머는 못 보지만 실사용 기록 수를 넘는 선이라 무해하다.
  const safeOffset = Number.isFinite(offset)
    ? Math.min(MAX_OFFSET, Math.max(0, Math.floor(offset)))
    : 0;

  try {
    const { teamId } = await getRequestTeamContext();
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("get_team_posts", {
      p_team_id: teamId,
      p_limit: STORY_POST_LIMIT,
      p_offset: safeOffset,
    });

    if (error) {
      console.error("[loadMorePosts] 기록 자랑 추가 조회 실패", error);
      return { ok: false };
    }

    return { ok: true, posts: (data as StoryPost[] | null) ?? [] };
  } catch (e) {
    console.error("[loadMorePosts] 기록 자랑 추가 조회 예외", e);
    return { ok: false };
  }
}
