import { createAdminClient } from "@/lib/supabase/admin";

/**
 * FEE_ITEM_CD 공통코드 그룹에 존재하는 유효한 분류 cd 집합을 조회한다.
 * 분류 유효성의 단일 진실(source of truth)은 공통코드(cmm_cd_mst)이며,
 * fee_txn_hist 에는 더 이상 CHECK 제약이 없으므로 적재 전 이 집합으로 검증한다.
 */
export async function getValidFeeItemCds(
  db: ReturnType<typeof createAdminClient>,
): Promise<Set<string>> {
  const { data } = await db
    .from("cmm_cd_mst")
    .select("cd, cmm_cd_grp_mst!inner(cd_grp_cd)")
    .eq("cmm_cd_grp_mst.cd_grp_cd", "FEE_ITEM_CD")
    .eq("vers", 0)
    .eq("del_yn", false);
  return new Set((data ?? []).map((r) => r.cd));
}
