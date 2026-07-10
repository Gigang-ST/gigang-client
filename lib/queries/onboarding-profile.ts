import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * 본인 가까운 역(mem_onbd_prf.near_stn_nm) 조회. RLS(mem_onbd_prf_select_own)로 본인 행만 통과.
 * 프로필 편집에서 수정 가능한 온보딩 항목은 가까운 역뿐 — 나머지 컬럼은 조회하지 않는다.
 */
export async function getNearStation(memId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mem_onbd_prf")
    .select("near_stn_nm")
    .eq("mem_id", memId)
    .maybeSingle();

  if (error) {
    console.error("[onboarding] 가까운 역 조회 실패", error.message);
    return null;
  }

  return data?.near_stn_nm ?? null;
}
