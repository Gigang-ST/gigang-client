import "server-only";

import { isPastLockedFor } from "@/lib/past-event";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export type JoinGatheringResult =
  | { joined: true }
  | { joined: false; reason: "not_found" | "past_locked" | "full" | "error" };

/**
 * 모임 참석 등록(가입) 공유 로직 — 모임 존재·팀 일치·del_yn·지난모임잠금·정원재확인·upsert.
 * `toggleGatheringAttendance`(기존 참석 토글)와 `onboardingCreateMember`(온보딩 참석 약속)가
 * 공유한다 — 설계 docs/design/2026-07-08-뉴비온보딩-유령회원방지.md §2.2 "기존 로직 재사용".
 *
 * 정원 재확인은 신청 시점 기준(호출 시점에 이미 조회한 모임 데이터가 오래됐을 수 있으므로) —
 * 온보딩처럼 페이지 로드 후 시간이 지나 신청하는 경로에서 특히 중요하다.
 *
 * team_id 필터를 gthr_mst 조회에 반드시 포함한다 — gthr_id는 클라이언트 입력값이라
 * 다른 팀 모임 gthr_id를 조작해 넣는 것을 방어한다(백엔드 리뷰 P2-10).
 *
 * @param admin service role 클라이언트(RLS 우회) — 두 호출부 모두 admin 클라이언트를 쓴다
 *   (온보딩은 회원 행이 아직 없어 RLS 통과 불가, 토글은 기존에도 정원 조회에 admin을 썼다)
 * @param gthrId 참석 대상 모임 id
 * @param memId 참석자 mem_id
 * @param teamId 요청 팀 컨텍스트(getRequestTeamContext) — 다른 팀 모임 조작 방어
 * @param isAdmin 관리자 여부 — 지난 모임 잠금 예외
 */
export async function joinGatheringWithCapCheck(
  admin: ReturnType<typeof createUntypedAdminClient>,
  {
    gthrId,
    memId,
    teamId,
    isAdmin,
  }: { gthrId: string; memId: string; teamId: string; isAdmin: boolean },
): Promise<JoinGatheringResult> {
  const { data: gthr, error: gthrErr } = await admin
    .from("gthr_mst")
    .select("gthr_id, max_prt_cnt, stt_at, end_at, del_yn")
    .eq("gthr_id", gthrId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .maybeSingle();

  if (gthrErr) {
    console.error("[join-gathering] 모임 조회 실패", gthrErr.message);
    return { joined: false, reason: "error" };
  }
  if (!gthr) return { joined: false, reason: "not_found" };

  if (isPastLockedFor(isAdmin, gthr.stt_at, gthr.end_at)) {
    return { joined: false, reason: "past_locked" };
  }

  if (gthr.max_prt_cnt !== null) {
    const { count, error: countErr } = await admin
      .from("gthr_attd_rel")
      .select("attd_id", { count: "exact", head: true })
      .eq("gthr_id", gthrId);

    if (countErr) {
      console.error("[join-gathering] 정원 확인 실패", countErr.message);
      return { joined: false, reason: "error" };
    }
    if ((count ?? 0) >= gthr.max_prt_cnt) {
      return { joined: false, reason: "full" };
    }
  }

  // UNIQUE(gthr_id, mem_id) 제약이 있으므로 upsert로 중복 충돌 방지
  const { error: upsertErr } = await admin
    .from("gthr_attd_rel")
    .upsert({ gthr_id: gthrId, mem_id: memId }, { onConflict: "gthr_id,mem_id", ignoreDuplicates: true });

  if (upsertErr) {
    console.error("[join-gathering] 참석 등록 실패", upsertErr.message);
    return { joined: false, reason: "error" };
  }

  return { joined: true };
}
