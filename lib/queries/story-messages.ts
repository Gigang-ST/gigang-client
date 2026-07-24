import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

/** 종이비행기 한마디 한 건 — `get_team_messages` RPC 반환 형태 */
export type StoryMessage = {
  msg_id: string;
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  msg_txt: string;
  /** 작성 시각(ISO). 24시간 만료·배너 카운트다운의 기준점 */
  crt_at: string;
};

/**
 * 한마디 조회 상한 — 24시간 안에 올라온 것만 오므로 이 정도면 넘칠 일이 없다.
 * 하늘에는 몇 개만 띄우고(SKY_SHOWN) 나머지는 다음 순번을 기다린다.
 */
export const STORY_MESSAGE_LIMIT = 20;

/**
 * 종이비행기 한마디 조회 — 24시간 이내, 최신순.
 *
 * `getStoryFeed`(큰 피드 RPC)와 **별도 RPC·별도 캐시 태그**다. 이유는 각오·기록자랑과 같다:
 * `get_team_story_feed`는 이미 CTE 10개+이고 운영 중이라, 존 하나 때문에 그 함수를 다시
 * 배포하는 건 위험 대비 이득이 없다. 한마디만 떼어 두면 이 슬라이스만 갱신된다.
 *
 * 캐시를 5분이나 두는데 24시간짜리 데이터를 다루는 게 어색해 보일 수 있지만 문제되지 않는다 —
 * 새 한마디의 즉시 반영은 `createMessage`의 `updateTag`와 Realtime 구독이 맡고, 만료는
 * 클라이언트 타이머가 매초 치우기 때문이다. 캐시는 최초 조회 비용만 아낀다.
 */
export function getStoryMessages(teamId: string): Promise<StoryMessage[]> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc("get_team_messages", {
        p_team_id: teamId,
        p_limit: STORY_MESSAGE_LIMIT,
      });

      if (error) {
        // RPC 미배포 환경(마이그레이션 전)에서도 전광판 전체가 죽지 않게 빈 배열로 폴백한다.
        // 배포 직후 하늘이 계속 비어 보이면 여기를 먼저 본다 — PostgREST 스키마 캐시가
        // 새 함수를 아직 모르면 이 분기로 떨어진다(`NOTIFY pgrst, 'reload schema'`).
        if (!isRequestAbortError(error)) {
          console.error("[getStoryMessages] 한마디 조회 실패", error);
        }
        return [];
      }

      return (data as StoryMessage[] | null) ?? [];
    },
    ["story-messages", teamId],
    { tags: ["story-messages"], revalidate: 300 },
  )();
}
