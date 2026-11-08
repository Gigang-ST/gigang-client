import type { SupabaseClient } from "@supabase/supabase-js";

import type { HyroxRankingRow } from "@/lib/hyrox";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/**
 * 팀의 하이록스 대회 기록 전부(`get_public_team_hyrox_rankings`) — 전당 하이록스 판과 MCP 조회 도구가 같이 쓴다.
 *
 * 기록은 시간이 갈수록 느는 조회라 `fetchAllRows` 로 끝까지 읽는다(TABLE RPC 도 1000행에서 잘린다).
 * 정렬 키는 기록 PK(`race_result_id`) — 유일해야 페이지 경계에서 겹치거나 빠지지 않는다.
 *
 * @param db service role 클라이언트(RPC 는 SECURITY DEFINER 라 anon 으로도 돌지만 호출부는 서버뿐이다)
 * @param teamId 조회할 팀
 * @returns RPC 행 그대로
 * @throws RPC 실패 시(마이그레이션 미적용으로 함수가 없을 때 포함)
 */
export async function fetchHyroxRankingRows(
  db: SupabaseClient<Database>,
  teamId: string,
): Promise<HyroxRankingRow[]> {
  return fetchAllRows(
    () =>
      db
        .rpc("get_public_team_hyrox_rankings", { p_team_id: teamId })
        .order("race_result_id", { ascending: true }),
    { label: "hyrox-rankings" },
  );
}
