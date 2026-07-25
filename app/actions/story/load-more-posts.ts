"use server";

import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORY_POST_LIMIT } from "@/lib/story-post";
import type { StoryPost } from "@/lib/queries/story-posts";

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
export async function loadMorePosts(offset: number): Promise<StoryPost[]> {
  // 음수·비정수 오프셋은 조용히 0으로 — 클라이언트가 보낸 값이라 그대로 믿지 않는다
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

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
      return [];
    }

    return (data as StoryPost[] | null) ?? [];
  } catch (e) {
    console.error("[loadMorePosts] 기록 자랑 추가 조회 예외", e);
    return [];
  }
}
