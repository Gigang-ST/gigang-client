import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

import type { RecentTitleRow } from "@/lib/story-title";

/**
 * RPC가 돌려준 jsonb를 **한 번 거른다**.
 *
 * ⚠️ jsonb는 스키마를 못 믿는 자리다(KNOWLEDGE.md). 특히 `grants`는 화면이 곧바로
 * `row.grants.some(...)`으로 파고들어(`story-lede.tsx`), 배열이 아닌 값이 하나라도
 * 섞이면 **전광판 전체가 렌더 단계에서 죽는다**. payload 모양을 바꾼 배포 직후에는
 * `unstable_cache`에 옛 모양이 5분 남아 있어 실제로 그 창이 열린다.
 * 배열 필드만 되살리면 되므로 전면 검증은 하지 않는다(`team-overview.ts`와 같은 방식).
 */
function normalizeRows(data: unknown): RecentTitleRow[] {
  if (!Array.isArray(data)) return [];
  return (data as RecentTitleRow[]).map((row) => ({
    ...row,
    grants: Array.isArray(row?.grants) ? row.grants : [],
  }));
}

/**
 * 전광판 칭호획득 슬롯 조회 — 최근 30일 수여를 칭호별 묶음으로.
 *
 * `getStoryFeed`와 **별도 RPC·별도 캐시 태그**다(`getStoryPosts`와 같은 두 가지 이유):
 * 1. `get_team_story_feed`는 이미 CTE 10개+라 존을 얹을 때마다 재배포하는 건 위험하다.
 * 2. 칭호 획득의 실시간성은 인앱 알림+푸시(`ttl_grnt`)가 이미 맡고 있어 슬롯은 5분
 *    캐시로 충분하다. 수여 경로(칭호 엔진)는 fire-and-forget admin 컨텍스트라
 *    revalidateTag를 걸지 않는다 — TTL 만료로만 갱신된다.
 */
export function getRecentTitleGrants(teamId: string): Promise<RecentTitleRow[]> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc(
        "get_team_recent_title_grants",
        { p_team_id: teamId },
      );

      if (error) {
        // RPC 미배포 환경(마이그레이션 전)에서도 전광판 전체가 죽지 않게 빈 배열로
        // 폴백한다 — 배포 직후 슬롯이 계속 비면 여기를 먼저 본다(PostgREST 스키마
        // 캐시가 새 함수를 아직 모르면 이 분기로 떨어진다. `NOTIFY pgrst, 'reload schema'`).
        if (!isRequestAbortError(error)) {
          console.error("[getRecentTitleGrants] 칭호획득 조회 실패", error);
        }
        return [];
      }

      return normalizeRows(data);
    },
    ["story-titles", teamId],
    { tags: ["story-titles"], revalidate: 300 },
  )();
}
