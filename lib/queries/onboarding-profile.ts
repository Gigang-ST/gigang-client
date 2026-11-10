import "server-only";

import { getRequestTeamContext } from "@/lib/queries/request-team";
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
 * 거리·페이스·역은 사람 것(mem_onbd_prf), 가입 목적은 접속한 팀 것(team_mem_onbd_rel).
 * 행이 없는 개편 전 가입자는 전부 비어 있는 기본값을 돌려준다.
 */
export async function getRunningProfile(
  memId: string,
): Promise<EditableRunningProfile> {
  const supabase = await createClient();
  const { teamId } = await getRequestTeamContext();
  const [{ data, error }, { data: purp, error: purpErr }] = await Promise.all([
    supabase
      .from("mem_onbd_prf")
      .select("near_stn_nm, avg_run_dist_km, avg_pace_cd")
      .eq("mem_id", memId)
      .maybeSingle(),
    supabase
      .from("team_mem_onbd_rel")
      .select("join_purp_cds, join_purp_txt")
      .eq("team_id", teamId)
      .eq("mem_id", memId)
      .maybeSingle(),
  ]);

  // 조회 실패를 빈 프로필로 돌려주면 안 된다 — 편집 폼이 빈칸으로 열리고, 그대로 저장하면 실제 거리·페이스·역·
  // 가입 목적이 빈 값으로 덮인다(PR #649 리뷰). 던져서 편집 화면이 오류로 멈추게 한다(다시 열면 된다).
  const err = error ?? purpErr;
  if (err) {
    if (!isRequestAbortError(err)) {
      console.error("[onboarding] 러닝 프로필 조회 실패", err.message);
    }
    throw new Error("러닝 프로필을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.");
  }

  return {
    nearStnNm: data?.near_stn_nm ?? null,
    // numeric 컬럼은 드라이버가 문자열로 줄 수 있어 명시적으로 숫자화한다.
    avgRunDistKm: data?.avg_run_dist_km != null ? Number(data.avg_run_dist_km) : null,
    avgPaceCd: data?.avg_pace_cd ?? null,
    joinPurpCds: purp?.join_purp_cds ?? [],
    joinPurpTxt: purp?.join_purp_txt ?? null,
  };
}
