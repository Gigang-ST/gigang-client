import type { SupabaseClient } from "@supabase/supabase-js";

import {
  attendKey,
  CANCEL_HIST_SELECT,
  summarizeCancels,
  toCancelEvents,
  type CancelHistRow,
} from "@/lib/gathering/cancel-stats";

/**
 * 한 회원의 모임 취소 수 — 프로필탭 최근활동 `취소 N`(본인 화면 전용).
 *
 * 개수만 필요하지만 `count: head`로 세면 안 된다: 같은 모임을 여러 번 취소한 것도,
 * 취소했다가 다시 참석한 것도 다 세어 버린다. 이력과 지금 참석을 받아
 * {@link summarizeCancels}로 세야 회원 상세·참여 탭과 같은 숫자가 나온다.
 *
 * 조회가 실패하면 0으로 둔다 — 부가 표시 하나 때문에 프로필 전체가 깨지면 안 된다.
 */
export async function getMemberCancelCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  memId: string,
  teamId: string,
): Promise<number> {
  const [histRes, attdRes] = await Promise.all([
    supabase
      .from("gthr_attd_hist")
      .select(CANCEL_HIST_SELECT)
      .eq("mem_id", memId)
      .eq("evt_cd", "cancel")
      .eq("gthr_mst.team_id", teamId)
      .eq("gthr_mst.del_yn", false),
    supabase
      .from("gthr_attd_rel")
      .select("gthr_id, gthr_mst!inner(team_id, del_yn)")
      .eq("mem_id", memId)
      .eq("gthr_mst.team_id", teamId)
      .eq("gthr_mst.del_yn", false),
  ]);
  if (histRes.error || attdRes.error) {
    console.error(
      "[profile] 모임 취소 수 조회 실패",
      histRes.error?.message ?? attdRes.error?.message,
    );
    return 0;
  }

  const attending = new Set(
    ((attdRes.data ?? []) as { gthr_id: string }[]).map((a) => attendKey(memId, a.gthr_id)),
  );
  return summarizeCancels(
    toCancelEvents((histRes.data ?? []) as unknown as CancelHistRow[]),
    attending,
  ).total;
}
