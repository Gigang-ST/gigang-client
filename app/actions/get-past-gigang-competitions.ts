"use server";

import { createClient } from "@/lib/supabase/server";
import type { Competition } from "@/components/races/types";

/**
 * 기강이 참가한 과거 대회만 조회 (competition_registration 1명 이상).
 * @param before - 이 날짜 미만의 대회 (YYYY-MM-DD)
 * @param monthsBack - 과거 몇 개월 구간 (예: 3 → before 기준 3개월 전 ~ before)
 * @returns list + nextBefore (다음 "이전 3개월 더 보기"에 쓸 날짜; 목록이 비어 있어도 더 과거 구간 요청 가능)
 */
export async function getPastGigangCompetitions(
  before: string,
  monthsBack: number,
): Promise<{ list: Competition[]; nextBefore: string }> {
  const supabase = await createClient();
  const end = new Date(before + "T12:00:00Z");
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - monthsBack);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("competition")
    .select(
      "id, external_id, sport, title, start_date, end_date, location, event_types, source_url, competition_registration!inner(id)",
    )
    .gte("start_date", startStr)
    .lt("start_date", endStr)
    .order("start_date", { ascending: false });

  const rows = data ?? [];
  const seen = new Set<string>();
  const list: Competition[] = [];
  for (const row of rows) {
    const { competition_registration: _reg, ...rest } = row as typeof row & { competition_registration: unknown };
    if (seen.has(rest.id)) continue;
    seen.add(rest.id);
    list.push(rest as Competition);
  }
  return { list, nextBefore: startStr };
}
