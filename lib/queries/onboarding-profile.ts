import "server-only";

import { createClient } from "@/lib/supabase/server";

/** `/profile/edit` 러닝 프로필 섹션 등 서버 컴포넌트에서 쓰는 온보딩 프로필 형태 */
export type OnbdProfile = {
  nearStnNm: string | null;
  avgRunDistKm: number | null;
  avgPaceCd: string | null;
  joinPurpCds: string[];
  joinPurpTxt: string | null;
};

/**
 * 본인 온보딩 프로필(mem_onbd_prf) 조회. RLS(mem_onbd_prf_select_own)로 본인 행만 통과.
 * 편집 폼 대상이 아닌 attd_pldg_at·pldg_gthr_id·join_src_cd·join_src_txt는 조회하지 않는다.
 */
export async function getOnbdProfile(memId: string): Promise<OnbdProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mem_onbd_prf")
    .select("near_stn_nm, avg_run_dist_km, avg_pace_cd, join_purp_cds, join_purp_txt")
    .eq("mem_id", memId)
    .maybeSingle();

  if (error) {
    console.error("[onboarding] 온보딩 프로필 조회 실패", error.message);
    return null;
  }
  if (!data) return null;

  return {
    nearStnNm: data.near_stn_nm,
    avgRunDistKm: data.avg_run_dist_km,
    avgPaceCd: data.avg_pace_cd,
    joinPurpCds: data.join_purp_cds ?? [],
    joinPurpTxt: data.join_purp_txt,
  };
}
