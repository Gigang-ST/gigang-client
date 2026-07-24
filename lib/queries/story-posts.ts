import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

/** 전광판 기록 자랑 한 건 — `get_team_posts` RPC 반환 형태 */
export type StoryPost = {
  post_id: string;
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  /** Storage 공개 URL. 마일리지런 자동 유입분은 사진이 없어 null */
  photo_url: string | null;
  /** 한마디 — 마일리지런 `review`와 같은 역할 */
  cmnt_txt: string;
  /** 거리(km). numeric이라 Supabase가 number로 준다 */
  dst_km: number | null;
  /** 종목 — 마일리지런 `evt_mlg_sprt_enm` 값 문자열 */
  sprt_enm: string | null;
  /** 활동일 (YYYY-MM-DD). 팻말에 찍히는 날짜는 작성일이 아니라 이것 */
  act_dt: string | null;
  /** manual=직접 작성, mlg_auto=마일리지런에서 자동 유입 */
  src_enm: "manual" | "mlg_auto";
  crt_at: string;
};

/** 전광판에 세우는 팻말 수 — 가로 스크롤이라 너무 길면 끝을 못 본다 */
export const STORY_POST_LIMIT = 12;

/**
 * 전광판 기록 자랑 조회.
 *
 * `getStoryFeed`와 **별도 RPC·별도 캐시 태그**다. 두 가지 이유:
 * 1. `get_team_story_feed`는 이미 CTE 10개+이고 운영 중이라, 새 존을 얹을 때마다 그 함수를
 *    다시 배포하는 건 위험 대비 이득이 없다.
 * 2. 무효화 주기가 다르다 — 기록 자랑은 작성 즉시 보여야 하고(`revalidateTag("story-posts")`),
 *    피드 본문은 5분 캐시로 충분하다. 한 태그로 묶으면 자랑 한 건이 피드 전체를 날린다.
 */
export function getStoryPosts(teamId: string): Promise<StoryPost[]> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc("get_team_posts", {
        p_team_id: teamId,
        p_limit: STORY_POST_LIMIT,
      });

      if (error) {
        // RPC 미배포 환경(마이그레이션 전)에서도 전광판 전체가 죽지 않게 빈 배열로 폴백한다.
        // 배포 직후 빈 코스가 계속 보이면 여기를 먼저 본다 — PostgREST 스키마 캐시가
        // 새 함수를 아직 모르면 이 분기로 떨어진다(`NOTIFY pgrst, 'reload schema'`).
        if (!isRequestAbortError(error)) {
          console.error("[getStoryPosts] 기록 자랑 조회 실패", error);
        }
        return [];
      }

      return (data as StoryPost[] | null) ?? [];
    },
    ["story-posts", teamId],
    { tags: ["story-posts"], revalidate: 300 },
  )();
}
