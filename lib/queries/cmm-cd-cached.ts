import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

import { normalizeCompEvtTypeKey } from "@/lib/comp-evt-type";
import { evtGrpCdForSprt } from "@/lib/comp-sprt-to-evt-grp";
import { COMMON_CODES_CACHE_TAG } from "@/lib/common-codes-cache-tag";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/** 캐시에 담기는 공통코드 1행 (그룹 코드 문자열 포함) */
export type CachedCmmCdRow = {
  cd_grp_cd: string;
  cd: string;
  cd_nm: string;
  sort_ord: number;
};

type CdMstRow = {
  cd_grp_id: string;
  cd: string;
  cd_nm: string;
  sort_ord: number;
};

async function loadAllCmmCdRows(): Promise<CachedCmmCdRow[]> {
  const supabase = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  const [{ data: grps, error: gErr }, { data: cds, error: cErr }] = await Promise.all([
    supabase
      .from("cmm_cd_grp_mst")
      .select("cd_grp_id, cd_grp_cd, sort_ord")
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("sort_ord", { ascending: true }),
    supabase
      .from("cmm_cd_mst")
      .select("cd_grp_id, cd, cd_nm, sort_ord")
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("use_yn", true),
  ]);

  if (gErr || cErr || !grps || !cds) {
    console.error("공통코드(cmm_cd) 전체 조회 실패:", gErr ?? cErr);
    return [];
  }

  const idToGrpCd = new Map(grps.map((g) => [g.cd_grp_id, g.cd_grp_cd]));
  const rows: CachedCmmCdRow[] = [];

  for (const row of cds as CdMstRow[]) {
    const cd_grp_cd = idToGrpCd.get(row.cd_grp_id);
    if (!cd_grp_cd) continue;
    rows.push({
      cd_grp_cd,
      cd: row.cd,
      cd_nm: row.cd_nm,
      sort_ord: row.sort_ord,
    });
  }

  rows.sort((a, b) => {
    if (a.cd_grp_cd !== b.cd_grp_cd) return a.cd_grp_cd.localeCompare(b.cd_grp_cd);
    return a.sort_ord - b.sort_ord;
  });

  return rows;
}

const getCmmCdRowsUncached = unstable_cache(
  loadAllCmmCdRows,
  ["cmm-cd-all-rows"],
  { tags: [COMMON_CODES_CACHE_TAG], revalidate: 86400 },
);

/**
 * 공통코드 전체 행 — 요청 간 `unstable_cache`, 동일 렌더 내 `cache()` 중복 제거.
 * (화면/액션에서 아직 사용하지 않아도, 이후 `COMP_SPRT_CD` 등 조회 시 이 함수만 부르면 된다.)
 */
export const getCachedCmmCdRows = cache(async () => getCmmCdRowsUncached());

/** 특정 그룹 코드의 코드만 sort_ord 순 */
export function cmmCdRowsForGrp(
  rows: readonly CachedCmmCdRow[],
  cdGrpCd: string,
): { cd: string; cd_nm: string }[] {
  return rows
    .filter((r) => r.cd_grp_cd === cdGrpCd)
    .sort((a, b) => a.sort_ord - b.sort_ord)
    .map(({ cd, cd_nm }) => ({ cd, cd_nm }));
}

/** COMP_SPRT_CD 코드값이 캐시에 있는지 */
export function isValidCompSprtCd(rows: readonly CachedCmmCdRow[], sprtCd: string): boolean {
  return cmmCdRowsForGrp(rows, "COMP_SPRT_CD").some((r) => r.cd === sprtCd);
}

/**
 * 스포츠 코드에 매핑된 이벤트 공통코드 그룹의 `cd` 목록 (`sort_ord` 순, comp_evt_type 키 규격으로 정규화).
 */
export function eventTypeCodesForSprtFromCmmRows(
  rows: readonly CachedCmmCdRow[],
  sprtCd: string | null | undefined,
): string[] {
  const grp = evtGrpCdForSprt(sprtCd);
  if (!grp) return [];
  return cmmCdRowsForGrp(rows, grp).map(({ cd }) => normalizeCompEvtTypeKey(cd));
}
