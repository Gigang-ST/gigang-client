"use server";

import { createClient } from "@/lib/supabase/server";

export type SearchCompetition = {
  id: string;
  title: string;
  start_date: string;
  location: string | null;
  sport: string | null;
  event_types: string[] | null;
};

/**
 * 전체 대회 목록에서 제목으로 검색 (자동완성용).
 */
export async function searchCompetitions(query: string): Promise<SearchCompetition[]> {
  if (!query.trim()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("comp_mst")
    .select("comp_id, comp_nm, stt_dt, loc_nm, comp_sprt_cd, comp_evt_cfg(comp_evt_type)")
    .ilike("comp_nm", `%${query.trim()}%`)
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("stt_dt", { ascending: false })
    .limit(20);
  return (data ?? []).map((row) => ({
    id: row.comp_id,
    title: row.comp_nm,
    start_date: row.stt_dt,
    location: row.loc_nm,
    sport: row.comp_sprt_cd,
    event_types: (((row as unknown as { comp_evt_cfg?: { comp_evt_type: string | null }[] }).comp_evt_cfg ?? []).map((e) => e.comp_evt_type?.toUpperCase()).filter(Boolean) as string[]),
  }));
}
