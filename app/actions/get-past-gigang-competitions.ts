"use server";

import { createClient } from "@/lib/supabase/server";
import type { Competition } from "@/components/races/types";

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
  const end = new Date(before + "T12:00:00Z");
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - monthsBack);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("team_comp_plan_rel")
    .select(
      "team_comp_id, comp_mst!inner(comp_id, ext_id, comp_sprt_cd, comp_nm, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(evt_cd)), comp_reg_rel!inner(comp_reg_id)",
    )
    .eq("vers", 0)
    .eq("del_yn", false)
    .gte("comp_mst.stt_dt", startStr)
    .lt("comp_mst.stt_dt", endStr)
    .order("stt_dt", { foreignTable: "comp_mst", ascending: false });

  const rows = data ?? [];
  const seen = new Set<string>();
  const list: Competition[] = [];
  for (const row of rows) {
    const comp = (row as unknown as { comp_mst: Competition[] | Competition }).comp_mst;
    const compRow = Array.isArray(comp) ? comp[0] : comp;
    if (!compRow) continue;
    const mapped: Competition = {
      id: (compRow as unknown as { comp_id: string }).comp_id,
      external_id: (compRow as unknown as { ext_id: string | null }).ext_id ?? "",
      sport: (compRow as unknown as { comp_sprt_cd: string | null }).comp_sprt_cd,
      title: (compRow as unknown as { comp_nm: string }).comp_nm,
      start_date: (compRow as unknown as { stt_dt: string }).stt_dt,
      end_date: (compRow as unknown as { end_dt: string | null }).end_dt,
      location: (compRow as unknown as { loc_nm: string | null }).loc_nm,
      event_types: (((compRow as unknown as { comp_evt_cfg?: { evt_cd: string }[] }).comp_evt_cfg) ?? []).map((e) => e.evt_cd?.toUpperCase()).filter(Boolean),
      source_url: (compRow as unknown as { src_url: string | null }).src_url,
    };
    if (seen.has(mapped.id)) continue;
    seen.add(mapped.id);
    list.push(mapped);
  }
  return { list, nextBefore: startStr };
}
