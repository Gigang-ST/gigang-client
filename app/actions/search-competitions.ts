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

const RACE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 대회 시작일~종료일 구간에 해당 날짜가 포함되는 대회 목록 (기록 입력용).
 * `end_dt`가 없으면 `stt_dt` 하루만 해당하는 것으로 본다.
 */
export async function listCompetitionsByRaceDate(raceDate: string): Promise<SearchCompetition[]> {
  const d = raceDate.trim();
  if (!RACE_DATE_RE.test(d)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comp_mst")
    .select("comp_id, comp_nm, stt_dt, end_dt, loc_nm, comp_sprt_cd, comp_evt_cfg(comp_evt_type)")
    .lte("stt_dt", d)
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("stt_dt", { ascending: false })
    .limit(200);

  if (error) return [];

  type Row = NonNullable<typeof data>[number];
  return (data ?? [])
    .filter((row: Row) => {
      const end = row.end_dt ?? row.stt_dt;
      return end >= d;
    })
    .map((row) => ({
      id: row.comp_id,
      title: row.comp_nm,
      start_date: row.stt_dt,
      location: row.loc_nm,
      sport: row.comp_sprt_cd,
      event_types: (((row as unknown as { comp_evt_cfg?: { comp_evt_type: string | null }[] }).comp_evt_cfg ?? []).map((e) => e.comp_evt_type?.toUpperCase()).filter(Boolean) as string[]),
    }));
}
