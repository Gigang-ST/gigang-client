import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

/**
 * 전광판 각오 한 건 — `get_team_pledges` RPC 반환 형태.
 * `StoryPledge`(story-feed)와 같은 필드에 `float_at`이 더해진 것 — 하늘 정렬과
 * "떠 있은 시간" 표시가 이 값을 쓴다.
 */
export type StoryFloatPledge = {
  pldg_id: string;
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  pldg_txt: string;
  crt_at: string;
  /** 하늘에 떠오른 시각(ISO). 작성 시 crt_at과 같고, 이륙하면 갱신된다 */
  float_at: string;
};

/** 각오 조회 상한 — 하늘(최대 4) + 착륙장 몇 개면 충분하다 */
export const STORY_PLEDGE_LIMIT = 20;

/**
 * 전광판 각오 조회 — 사람당 1건, `float_at` 최신순.
 *
 * `getStoryFeed`(큰 피드 RPC)와 **별도 RPC·별도 캐시 태그**다. 이유는 record_flex와 같다:
 * `get_team_story_feed`는 이미 CTE 10개+이고 운영 중이라, "띄우기"가 그 큰 피드 캐시를
 * 무효화하면 존 전체가 재계산된다. 각오만 떼어 두면 띄우기가 연타돼도 이 슬라이스만 갱신된다.
 *
 * 실시간 반영은 클라이언트의 `pldg_mst` Realtime 구독이 맡는다 — 이 캐시(`story-pledges`
 * 태그)는 서버 재조회의 소스일 뿐이고, 띄우기 서버 액션이 `revalidateTag`로 무효화한다.
 */
export function getStoryPledges(teamId: string): Promise<StoryFloatPledge[]> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc("get_team_pledges", {
        p_team_id: teamId,
        p_limit: STORY_PLEDGE_LIMIT,
      });

      if (error) {
        // RPC 미배포 환경에서도 전광판 전체가 죽지 않게 빈 배열로 폴백한다.
        // 배포 직후 계속 비어 보이면 PostgREST 스키마 캐시부터 의심(`NOTIFY pgrst, 'reload schema'`).
        if (!isRequestAbortError(error)) {
          console.error("[getStoryPledges] 각오 조회 실패", error);
        }
        return [];
      }

      return (data as StoryFloatPledge[] | null) ?? [];
    },
    ["story-pledges", teamId],
    { tags: ["story-pledges"], revalidate: 300 },
  )();
}
