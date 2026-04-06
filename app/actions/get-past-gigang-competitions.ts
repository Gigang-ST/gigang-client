"use server";

import { createClient } from "@/lib/supabase/server";
import type { Competition } from "@/components/races/types";
import { getRequestTeamContext } from "@/lib/queries/request-team";

/**
 * 기강이 참가한 과거 대회만 조회 (comp_reg_rel 1명 이상).
 * @param before - 이 날짜 미만의 대회 (YYYY-MM-DD)
 * @param monthsBack - 과거 몇 개월 구간 (예: 3 → before 기준 3개월 전 ~ before)
 * @returns list + nextBefore (다음 "이전 3개월 더 보기"에 쓸 날짜; 목록이 비어 있어도 더 과거 구간 요청 가능)
 */
export async function getPastGigangCompetitions(
  before: string,
  monthsBack: number,
): Promise<{ list: Competition[]; nextBefore: string }> {
  const supabase = await createClient();
  const { teamId } = await getRequestTeamContext();
  const end = new Date(before + "T12:00:00Z");
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - monthsBack);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const { data } = await supabase.rpc("get_public_team_competitions", {
    p_team_id: teamId,
    p_start: startStr,
    p_end: endStr,
  });

  const rows = data ?? [];
  const list: Competition[] = rows
    .filter((row) => (row.reg_count ?? 0) > 0)
    .map((row) => ({
      id: row.comp_id,
      external_id: row.ext_id ?? "",
      sport: row.comp_sprt_cd,
      title: row.comp_nm,
      start_date: row.stt_dt,
      end_date: row.end_dt,
      location: row.loc_nm,
      event_types: (row.comp_evt_cds ?? []).map((e) => e?.toUpperCase()).filter(Boolean),
      source_url: row.src_url,
    }))
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return { list, nextBefore: startStr };
}
