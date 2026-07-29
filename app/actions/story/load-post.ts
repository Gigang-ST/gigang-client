"use server";

import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUUID } from "@/lib/utils";
import type { StoryPost } from "@/lib/queries/story-posts";

/**
 * 결과 — **"못 찾음"과 "조회 실패"를 구분한다.**
 *
 * 둘 다 null로 뭉개면 호출부가 안내를 고를 수 없다: 못 찾음은 "이미 내려간 기록"이라 사용자에게
 * 사실대로 알려야 하고, 조회 실패는 우리 쪽 문제라 재시도 여지를 남겨야 한다
 * (`loadMorePosts`가 실패와 "끝"을 가른 것과 같은 이유).
 */
export type LoadStoryPostResult =
  | { ok: true; post: StoryPost | null }
  | { ok: false };

/**
 * 깅스타그램 기록 **한 건** 조회 — 댓글 알림 딥링크(`/story?rec=<post_id>`) 전용.
 *
 * **왜 필요한가**: 격자·릴스는 첫 16건(`STORY_POST_LIMIT`) + 사용자가 민 만큼만 들고 있다.
 * "내 운동기록에 새 댓글" 알림은 오래된 글일수록 오는데, 그 글이 목록에 없으면 릴스를 열
 * 방법이 없어 전광판 맨 위만 뜬다 — 주소는 살아 있는데 화면이 안 뜨는 상태(§deep-link.ts).
 * 목록에 없을 때만 이 액션으로 그 한 건을 받아 릴스에 얹는다.
 *
 * **비로그인도 부를 수 있다** — `loadMorePosts`와 같은 정책이다. 이 지면은 공개라 첫 16건을
 * 이미 보여주고 있고, 17번째부터 로그인을 요구할 근거가 없다. 팀 스코프는 서버가 Host에서
 * 정하므로(`getRequestTeamContext`) 남의 팀 기록은 애초에 닿지 않는다.
 *
 * 조회는 목록과 **같은 RPC**를 쓴다(`p_post_id`). 표시 모양(이름·프사·칭호·배지·사진 필터)이
 * 한 곳에서만 정의돼, 격자와 릴스에서 같은 기록이 다르게 보이는 일이 없다.
 */
export async function loadStoryPost(
  postId: string,
): Promise<LoadStoryPostResult> {
  // 주소창에서 온 값이라 그대로 믿지 않는다. uuid가 아니면 RPC에 태우는 순간 타입 에러가
  // 나므로(22P02) 여기서 "못 찾음"으로 눕힌다 — 사용자에겐 삭제된 기록과 같은 안내면 된다.
  if (!postId || !isUUID(postId)) return { ok: true, post: null };

  try {
    const { teamId } = await getRequestTeamContext();
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("get_team_posts", {
      p_team_id: teamId,
      p_post_id: postId,
    });

    if (error) {
      console.error("[loadStoryPost] 기록 단건 조회 실패", error);
      return { ok: false };
    }

    // RPC는 항상 배열을 준다(없으면 빈 배열) — 딥링크 대상이 삭제됐거나 사진이 없으면 여기.
    const posts = (data as StoryPost[] | null) ?? [];
    return { ok: true, post: posts[0] ?? null };
  } catch (e) {
    console.error("[loadStoryPost] 기록 단건 조회 예외", e);
    return { ok: false };
  }
}
