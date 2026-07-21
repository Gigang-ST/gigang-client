import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveCanceledAttendees } from "@/lib/gathering/derive-canceled-attendees";

import type { CanceledAttendee } from "@/app/(info)/gatherings/[id]/gathering-canceled-attendees";

/** 취소자 판정에 필요한 필드 + 표시용 멤버 정보를 한 행에 담은 클라이언트 조회 결과. */
type CancelHistClientRow = CanceledAttendee & { evt_cd: "register" | "cancel" };

/**
 * 브라우저(클라이언트)에서 특정 모임의 참석 이벤트 이력(gthr_attd_hist)을 최신순으로 조회한다.
 *
 * 서버 경로({@link import("./gathering-cancel-history").getGatheringAttendanceHistory})는
 * `server-only`라 클라이언트 번들에서 못 쓴다. 홈 캘린더 상세 모달(gathering-detail-dialog)은
 * 클라이언트 컴포넌트라 여기서 RLS를 타는 브라우저 supabase 클라이언트로 직접 조회한다.
 *
 * 보안: 취소 사유는 팀 멤버 전체 공개·비멤버 차단(A-03 오너 확정)이며, 이는 RLS 정책
 * `gthr_attd_hist_select`가 DB에서 강제한다 — SECURITY DEFINER RPC(get_gathering_detail,
 * anon 허용)에 사유를 실으면 비멤버에 노출되므로 절대 그 경로로 내리지 않는다.
 *
 * 취소자 "판정"(재참석 제외·멤버별 최신 1건)은 하지 않는다 — 그건 현재 참석자 집합이 필요하므로
 * 순수 함수 {@link deriveCanceledFromRows}로 분리해, 참석자 RPC와 이 조회를 병렬로 돌린 뒤 합친다.
 * gthr_attd_hist는 database.types.ts 미생성 테이블(SG-01)이라 클라이언트가 loosely-typed로 조회한다.
 */
export async function fetchGatheringCancelHistoryRowsClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  gthrId: string,
): Promise<CancelHistClientRow[]> {
  const { data, error } = await supabase
    .from("gthr_attd_hist")
    .select(
      // mem_mst FK가 둘(mem_id·actor_mem_id) → 임베드 관계를 FK 이름으로 명시해야
      // PostgREST "more than one relationship" 에러를 피한다. 취소 대상은 mem_id.
      "mem_id, evt_cd, reason_txt, evt_at, mem_mst!gthr_attd_hist_mem_id_fkey(mem_id, mem_nm, avatar_url)",
    )
    .eq("gthr_id", gthrId)
    .order("evt_at", { ascending: false });

  if (error) {
    console.error("[gathering] 취소 이력 조회 실패", error.message);
    return [];
  }

  type RawRow = {
    mem_id: string;
    evt_cd: "register" | "cancel";
    reason_txt: string | null;
    evt_at: string;
    mem_mst:
      | { mem_id: string; mem_nm: string; avatar_url: string | null }
      | { mem_id: string; mem_nm: string; avatar_url: string | null }[]
      | null;
  };

  return ((data ?? []) as RawRow[]).map((h) => {
    const mem = Array.isArray(h.mem_mst) ? h.mem_mst[0] : h.mem_mst;
    return {
      mem_id: h.mem_id,
      mem_nm: mem?.mem_nm ?? "",
      avatar_url: mem?.avatar_url ?? null,
      evt_at: h.evt_at,
      reason_txt: h.reason_txt,
      evt_cd: h.evt_cd,
    };
  });
}

/**
 * 조회된 이력 행에서 현재 취소자만 뽑는다(재참석자 제외·멤버별 최신 1건).
 * `attendingMemIds`는 gthr_attd_rel 현재 참석자 — 재참석 시 rel 존재로 자동 제외된다.
 */
export function deriveCanceledFromRows(
  rows: readonly CancelHistClientRow[],
  attendingMemIds: readonly string[],
): CanceledAttendee[] {
  // deriveCanceledAttendees는 제네릭이라 evt_cd를 포함한 행 모양을 그대로 보존해 돌려준다.
  return deriveCanceledAttendees(rows, attendingMemIds);
}
