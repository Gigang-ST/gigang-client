"use server";

import { withMember } from "@/lib/actions/auth";
import {
  dedupeRecentGatherings,
  type RecentGathering,
} from "@/lib/gathering/dedupe-recent";

/** get-recent-gatherings 조회 개수. 중복 제거 전 넉넉히 가져와 최종 8개로 접는다. */
const FETCH_LIMIT = 30;
const RESULT_LIMIT = 8;

/**
 * 현재 멤버가 만든 최근 모임을 "불러오기" 목록용으로 조회한다.
 *
 * - 본인이 개설(crt_by)한 활성 모임만, 시작일 최신순으로 FETCH_LIMIT개.
 * - 내용(제목·유형·종목·장소·최대인원·비고)이 같은 모임은 최근 것 하나로 접어 최대 RESULT_LIMIT개 반환.
 * - 지연 로딩(폼의 "최근 모임 불러오기" 버튼 클릭 시)으로만 호출되어 부하를 최소화한다.
 */
export async function getRecentGatherings(): Promise<RecentGathering[]> {
  return withMember(async ({ member, supabase }) => {
    const { data, error } = await supabase
      .from("gthr_mst")
      .select("gthr_id, gthr_nm, gthr_type_enm, sprt_cd, loc_txt, max_prt_cnt, desc_txt, stt_at")
      .eq("crt_by", member.id)
      .eq("del_yn", false)
      .order("stt_at", { ascending: false })
      .limit(FETCH_LIMIT);

    if (error) throw new Error("최근 모임을 불러오지 못했습니다.");

    return dedupeRecentGatherings((data ?? []) as RecentGathering[], RESULT_LIMIT);
  });
}
