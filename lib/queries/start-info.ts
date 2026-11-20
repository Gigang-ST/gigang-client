import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";
import {
  EMPTY_START_INFO,
  RUN_CAREER_CODES,
  START_INFO_SRC_CODES,
  START_REC_DIST_CODES,
  WKLY_DIST_CODES,
  type StartInfoSrcCode,
  type StartInfoValues,
} from "@/lib/validations/start-info";

export type StartInfoRead = StartInfoValues & {
  /** 처음 받은 곳 — 아직 안 적었으면 null */
  srcCd: StartInfoSrcCode | null;
  /** 처음 입력한 시각(ISO) */
  enteredAt: string | null;
};

function pick<T extends string>(list: readonly T[], v: string | null | undefined): T | null {
  return v && (list as readonly string[]).includes(v) ? (v as T) : null;
}

/**
 * 본인 시작 정보 조회(`/profile/edit` 초기값). 조회 실패를 빈 값으로 돌려주면
 * 편집 폼이 빈칸으로 열려 저장 때 기존 값을 덮으므로 던진다(`getRunningProfile` 과 같은 이유).
 */
export async function getStartInfo(memId: string): Promise<StartInfoRead> {
  const supabase = await createClient();
  const [{ data: prf, error: prfErr }, { data: recs, error: recErr }] = await Promise.all([
    supabase
      .from("mem_onbd_prf")
      .select("run_career_cd, wkly_dist_cd, start_rec_none_yn, start_info_src_cd, start_info_at")
      .eq("mem_id", memId)
      .maybeSingle(),
    supabase.from("mem_start_rec_rel").select("dist_cd, rec_sec").eq("mem_id", memId),
  ]);
  const err = prfErr ?? recErr;
  if (err) {
    if (!isRequestAbortError(err)) console.error("[start-info] 조회 실패", err.message);
    throw new Error("시작 정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.");
  }

  const records = (recs ?? []).flatMap((r) => {
    const distCd = pick(START_REC_DIST_CODES, r.dist_cd);
    return distCd ? [{ distCd, recSec: Number(r.rec_sec) }] : [];
  });
  // 정렬: 거리 코드 목록 순서(10K·하프·풀·5K) — 화면 순서가 저장 순서에 따라 흔들리지 않게
  records.sort((a, b) => START_REC_DIST_CODES.indexOf(a.distCd) - START_REC_DIST_CODES.indexOf(b.distCd));

  return {
    ...EMPTY_START_INFO,
    runCareerCd: pick(RUN_CAREER_CODES, prf?.run_career_cd),
    wklyDistCd: pick(WKLY_DIST_CODES, prf?.wkly_dist_cd),
    recNone: prf?.start_rec_none_yn ?? false,
    records,
    srcCd: pick(START_INFO_SRC_CODES, prf?.start_info_src_cd),
    enteredAt: prf?.start_info_at ?? null,
  };
}
