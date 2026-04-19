/**
 * `comp_mst.comp_sprt_cd`(COMP_SPRT_CD) → 이벤트 코드 그룹(`cmm_cd_grp_mst.cd_grp_cd`).
 * DB에 부모 FK가 없어 매핑은 애플리케이션 상수로 둔다.
 */
const COMP_SPRT_CD_TO_EVT_GRP_CD: Record<string, string> = {
  road_run: "ROAD_EVT_CD",
  ultra: "ULTRA_EVT_CD",
  trail_run: "TRAIL_EVT_CD",
  triathlon: "TRI_EVT_CD",
  cycling: "CYC_EVT_CD",
};

/** 대회 스포츠 코드에 대응하는 이벤트 코드 그룹. 없으면 null */
export function evtGrpCdForSprt(sprtCd: string | null | undefined): string | null {
  if (!sprtCd) return null;
  return COMP_SPRT_CD_TO_EVT_GRP_CD[sprtCd.toLowerCase()] ?? null;
}
