import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * gthr_attd_hist 1행 + 조인된 멤버 정보(mem_mst).
 * database.types.ts 미생성 테이블(SG-01)이라 select 결과를 수기 타입으로 둔다.
 * Supabase JS의 FK 임베드는 관계에 따라 단건 객체/배열 어느 쪽으로도 내려올 수 있어
 * 소비처(페이지)에서 `Array.isArray` 정규화가 필요하다(참석자 목록과 동일 패턴).
 */
export type GatheringAttdHistRow = {
  hist_id: string;
  mem_id: string;
  evt_cd: "register" | "cancel";
  actor_cd: "self" | "admin";
  reason_txt: string | null;
  evt_at: string;
  mem_mst:
    | { mem_id: string; mem_nm: string; avatar_url: string | null }
    | { mem_id: string; mem_nm: string; avatar_url: string | null }[]
    | null;
};

/**
 * 특정 모임의 참석 이벤트 이력(gthr_attd_hist) 전체를 최신순으로 조회한다.
 * RLS(`gthr_attd_hist_select`)가 팀 멤버 SELECT를 이미 허용하므로(취소 사유 포함 전체 공개 —
 * 오너 확정 정책) RLS를 타는 일반 supabase 클라이언트를 그대로 재사용한다. 관리자 클라이언트 불필요.
 *
 * 취소자 판정(재참석 제외·최신 1건)은 이 함수의 책임이 아니다 —
 * 순수 함수 {@link deriveCanceledAttendees}(`lib/gathering/derive-canceled-attendees.ts`)로 분리.
 */
export async function getGatheringAttendanceHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  gthrId: string,
): Promise<GatheringAttdHistRow[]> {
  const { data, error } = await supabase
    .from("gthr_attd_hist")
    .select(
      // mem_mst FK가 둘(mem_id·actor_mem_id) → 임베드 관계를 FK 이름으로 명시하지 않으면
      // PostgREST가 "more than one relationship" 에러를 낸다. 취소 대상은 mem_id.
      "hist_id, mem_id, evt_cd, actor_cd, reason_txt, evt_at, mem_mst!gthr_attd_hist_mem_id_fkey(mem_id, mem_nm, avatar_url)",
    )
    .eq("gthr_id", gthrId)
    .order("evt_at", { ascending: false });

  if (error) {
    console.error("[gathering] 참석 이력 조회 실패", error.message);
    return [];
  }

  return (data ?? []) as GatheringAttdHistRow[];
}
