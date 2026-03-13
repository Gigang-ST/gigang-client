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
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("competition")
    .select("id, title, start_date, location, sport, event_types")
    .ilike("title", `%${query.trim()}%`)
    .lte("start_date", today)
    .order("start_date", { ascending: false })
    .limit(20);
  return (data ?? []) as SearchCompetition[];
}
