import { createAdminClient } from "@/lib/supabase/admin";

/**
 * FEE_ITEM_CD 공통코드 그룹에 존재하는 유효한 분류 cd 집합을 조회한다.
 * 분류 유효성의 단일 진실(source of truth)은 공통코드(cmm_cd_mst)이며,
 * fee_txn_hist 에는 더 이상 CHECK 제약이 없으므로 적재 전 이 집합으로 검증한다.
 */
export async function getValidFeeItemCds(
  db: ReturnType<typeof createAdminClient>,
): Promise<Set<string>> {
  const { data, error } = await db
    .from("cmm_cd_mst")
    .select("cd, cmm_cd_grp_mst!inner(cd_grp_cd)")
    .eq("cmm_cd_grp_mst.cd_grp_cd", "FEE_ITEM_CD")
    .eq("vers", 0)
    .eq("del_yn", false);
  // 조회 실패를 빈 집합으로 삼키면 정상 분류도 "존재하지 않는 분류"로 거부되거나
  // 일괄 확정이 전부 막힌다. 인프라 장애와 입력 오류를 구분하기 위해 에러를 전파한다.
  if (error) throw new Error(`분류 코드 조회 실패: ${error.message}`);
  return new Set((data ?? []).map((r) => r.cd));
}
