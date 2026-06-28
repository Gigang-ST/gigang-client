import type { SupabaseClient } from "@supabase/supabase-js";

/** 마일리지 활동 기록 1건 (records 화면 표시용) */
export type ActivityRecord = {
  act_id: string;
  act_dt: string;
  sprt_enm: string;
  distance_km: number;
  elevation_m: number | null;
  base_mlg: number;
  applied_mults: { mult_id: string; mult_nm: string; mult_val: number }[] | null;
  final_mlg: number;
  review: string | null;
};

/**
 * 특정 참가자(prt_id)의 한 달치 활동 기록을 조회한다.
 * 서버 컴포넌트(첫 렌더 prefetch)와 클라이언트(월 전환)에서 공용으로 쓰도록
 * supabase 클라이언트를 주입받는다.
 *
 * @param month "YYYY-MM-01" 형식의 조회 월 시작일
 */
export async function fetchActivityRecords(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  prtId: string,
  month: string,
): Promise<ActivityRecord[]> {
  const [y, m] = month.split("-").map(Number);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const monthEnd = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

  const { data } = await supabase
    .from("evt_mlg_act_hist")
    .select("act_id, act_dt, sprt_enm, dst_km, elv_m, base_mlg, aply_mults, final_mlg, review")
    .eq("prt_id", prtId)
    .gte("act_dt", month)
    .lt("act_dt", monthEnd)
    .order("act_dt", { ascending: false });

  return (data ?? []).map((r) => ({
    act_id: r.act_id,
    act_dt: r.act_dt,
    sprt_enm: r.sprt_enm,
    distance_km: Number(r.dst_km),
    elevation_m: r.elv_m ? Number(r.elv_m) : null,
    base_mlg: Number(r.base_mlg),
    applied_mults: (r.aply_mults ?? null) as ActivityRecord["applied_mults"],
    final_mlg: Number(r.final_mlg),
    review: r.review ?? null,
  }));
}
