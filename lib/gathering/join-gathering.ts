import "server-only";

import { isPastLockedFor } from "@/lib/past-event";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export type JoinGatheringResult =
  | { joined: true; waiting: false }
  | { joined: false; waiting: true }
  | { joined: false; waiting: false; reason: "not_found" | "past_locked" | "error" };

// 조회/RPC 최소한만 요구하는 구조적 클라이언트 타입 — admin(service role)이면 이 형태다.
type SupabaseLike = ReturnType<typeof createUntypedAdminClient>;

/**
 * 모임 참석 등록(가입) 공유 로직 — `toggleGatheringAttendance`(참석 토글)와
 * `onboardingCreateMember`(온보딩 참석 약속)가 공유한다.
 * 설계 docs/superpowers/specs/2026-09-10-모임-대기열-design.md §4.
 *
 * **정원 판정과 INSERT 는 join_gthr_or_wait RPC 안에서 원자적으로 일어난다.**
 * 예전엔 여기서 `COUNT → upsert` 2단계로 처리했는데 원자적이지 않아(TOCTOU),
 * 만석 직전에 두 명이 동시에 누르면 정원+1 이 됐다. 대기열이 붙은 지금은 그 사고로
 * 넘친 1명이 대기열을 이유 없이 얼린다(승급 규칙이 `COUNT < max` 하나뿐이라서).
 *
 * **정원이 차면 실패가 아니라 대기 등록(`waiting`)이다.** 예전의 `reason: "full"` 은
 * 사라졌다 — 그게 이 기능의 발단이다(더 오고 싶은 사람에게 길이 없었다).
 *
 * **지난 모임 잠금은 여기(TS)가 판정한다.** `isPastLockedFor`는 KST 날짜 기준 +
 * 관리자 예외라 SQL 의 `now()` 비교로 옮기면 "오늘 저녁 모임이 2시간 전에 시작했지만
 * KST 같은 날이라 아직 열려 있다"를 잘못 막는다. 판정 정본은 하나로 둔다.
 *
 * team_id 필터를 gthr_mst 조회와 RPC 양쪽에 넣는다 — gthr_id 는 클라이언트 입력값이라
 * 다른 팀 모임 id 를 조작해 넣는 것을 방어한다(백엔드 리뷰 P2-10).
 *
 * @param admin 조회·RPC 용 service role 클라이언트.
 * @param gthrId 참석 대상 모임 id
 * @param memId 참석자 mem_id — **반드시 서버가 세션에서 꺼낸 값**을 넘긴다.
 *   RPC 는 service_role 전용이라 이 인자에 클라이언트 입력이 닿으면 곧 IDOR 다.
 * @param teamId 요청 팀 컨텍스트(getRequestTeamContext)
 * @param isAdmin 관리자 여부 — 지난 모임 잠금 예외
 */
export async function joinGatheringWithCapCheck(
  admin: SupabaseLike,
  {
    gthrId,
    memId,
    teamId,
    isAdmin,
  }: {
    gthrId: string;
    memId: string;
    teamId: string;
    isAdmin: boolean;
  },
): Promise<JoinGatheringResult> {
  const { data: gthr, error: gthrErr } = await admin
    .from("gthr_mst")
    .select("gthr_id, stt_at, end_at, del_yn")
    .eq("gthr_id", gthrId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .maybeSingle();

  if (gthrErr) {
    console.error("[join-gathering] 모임 조회 실패", gthrErr.message);
    return { joined: false, waiting: false, reason: "error" };
  }
  if (!gthr) return { joined: false, waiting: false, reason: "not_found" };

  if (isPastLockedFor(isAdmin, gthr.stt_at, gthr.end_at)) {
    return { joined: false, waiting: false, reason: "past_locked" };
  }

  // 정원 재확인 + INSERT(또는 대기 등록)를 한 트랜잭션으로. 신규 RPC 라 아직 DB 타입이
  // 없어 untyped 클라이언트로 호출한다(gen types 후 교체).
  const { data, error } = await admin.rpc("join_gthr_or_wait", {
    p_gthr_id: gthrId,
    p_mem_id: memId,
    p_team_id: teamId,
  });

  if (error) {
    console.error("[join-gathering] 참석 등록 실패", error.message);
    return { joined: false, waiting: false, reason: "error" };
  }

  if (data === "joined") return { joined: true, waiting: false };
  if (data === "waiting") return { joined: false, waiting: true };
  // 위 조회와 RPC 사이에 모임이 삭제된 경우
  return { joined: false, waiting: false, reason: "not_found" };
}
