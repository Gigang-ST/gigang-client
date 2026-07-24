import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

/** `/profile/edit` 러닝 프로필 섹션 초기값 — 프로필 카드 "소개"에 노출되는 값들 */
export type EditableRunningProfile = {
  nearStnNm: string | null;
  avgRunDistKm: number | null;
  avgPaceCd: string | null;
  joinPurpCds: string[];
  joinPurpTxt: string | null;
};

/**
 * 본인 러닝 프로필 조회 — 가까운 역까지 한 번에 받아온다(쿼리 1회).
 *
 * 유입 경로·참석 약속은 편집 대상이 아니라 select에 넣지 않는다.
 * 행이 없는 개편 전 가입자는 전부 비어 있는 기본값을 돌려준다.
 */
export async function getRunningProfile(
  memId: string,
): Promise<EditableRunningProfile> {
  const empty: EditableRunningProfile = {
    nearStnNm: null,
    avgRunDistKm: null,
    avgPaceCd: null,
    joinPurpCds: [],
    joinPurpTxt: null,
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mem_onbd_prf")
    .select("near_stn_nm, avg_run_dist_km, avg_pace_cd, join_purp_cds, join_purp_txt")
    .eq("mem_id", memId)
    .maybeSingle();

  if (error) {
    if (!isRequestAbortError(error)) {
      console.error("[onboarding] 러닝 프로필 조회 실패", error.message);
    }
    return empty;
  }
  if (!data) return empty;

  return {
    nearStnNm: data.near_stn_nm ?? null,
    // numeric 컬럼은 드라이버가 문자열로 줄 수 있어 명시적으로 숫자화한다.
    avgRunDistKm: data.avg_run_dist_km != null ? Number(data.avg_run_dist_km) : null,
    avgPaceCd: data.avg_pace_cd ?? null,
    joinPurpCds: data.join_purp_cds ?? [],
    joinPurpTxt: data.join_purp_txt ?? null,
  };
}
