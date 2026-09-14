import "server-only";

import { insertNotiMany } from "@/lib/notifications/insert-noti";
import type { createUntypedAdminClient } from "@/lib/supabase/admin";

type SupabaseLike = ReturnType<typeof createUntypedAdminClient>;

/**
 * 알림 문구의 정본.
 *
 * **"확정됐어요"(gthr_promo)와 어휘가 갈린다.** 저건 자동이라 할 일이 없고, 이건 직접
 * 눌러야 한다 — 같은 말로 쓰면 알림을 받고 "확정됐구나" 하고 안 누르는 사람이 생긴다.
 */
export const seatNotiTitle = (gthrNm: string) => `'${gthrNm}' 빈 자리가 났어요`;
export const SEAT_NOTI_BODY = "지금은 순번 없이 먼저 누르는 분이 참석하실 수 있어요.";

/**
 * 선착순 구간(시작 2시간 전부터)에 빈 자리가 났음을 대기자 전원에게 알린다.
 * 설계: docs/superpowers/specs/2026-09-11-모임-대기열-임박구간-design.md §3
 *
 * **이 알림이 없으면 지금보다 나빠진다.** 그 구간엔 자동 승급이 없으므로(promote RPC 가
 * 게이트로 막는다) 알림까지 없으면 대기자 전원이 모른 채 자리가 빈 채로 모임이 시작된다.
 *
 * **한 모임당 1회로 제한한다.** 정기런은 당일 취소가 서너 건씩 나는데 매번 보내면
 * 알림함이 도배된다 — 이미 받은 사람에게 "자리가 하나 더 났다"는 새 소식이 아니다
 * (유리해졌을 뿐 할 일이 같다).
 *
 * **시각을 약속하지 않는다.** 알림은 한 번 나가면 고쳐지지 않는데 "몇 시부터 가능"을
 * 적으면 그 사이 자리가 차서 거짓말이 된다. 지금 사실만 말하고, 실제로 누를 수 있는지는
 * 실시간으로 갱신되는 화면이 말한다.
 *
 * 두 호출부(본인 취소 · 운영진 제거)가 **공유한다** — 각자 만들면 한쪽만 1회 제한을
 * 빠뜨린다.
 *
 * @returns 실제로 알림을 보낸 mem_id 배열
 */
export async function notifyOpenSeat(
  admin: SupabaseLike,
  { gthrId, gthrNm, teamId }: { gthrId: string; gthrNm: string; teamId: string },
): Promise<string[]> {
  // 조회 오류는 **던진다.** 호출부가 .catch 로 기록한다.
  // 삼키면 ① 대기 명단 실패는 알림이 조용히 사라지고 ② 발송 이력 조회 실패는 `data=null` 이
  // "아무도 안 받았다"로 읽혀 대기자 전원에게 중복 발송된다.
  const { data: waitRows, error: waitError } = await admin
    .from("gthr_wait_rel")
    .select("mem_id")
    .eq("gthr_id", gthrId)
    .eq("wait_st_cd", "waiting");
  if (waitError) throw waitError;

  const waiting = ((waitRows ?? []) as { mem_id: string }[]).map((w) => w.mem_id);
  if (waiting.length === 0) return [];

  // 이 모임에 대해 이미 gthr_seat 를 받은 사람 제외(1회 제한).
  // del_yn 은 보지 않는다 — 알림을 지운 것과 "안 받은 것"은 다르다.
  //
  // ⚠️ 조회와 INSERT 가 원자적이지 않아, 같은 모임에서 두 취소가 ms 차이로 겹치면 중복 발송될
  //    수 있다. 부분 유니크 인덱스로 막지 않는 이유: insertNotiMany 가 대상 전원을 INSERT 한 번에
  //    넣으므로 1건만 충돌해도 배치 전체가 실패해 **아무도 못 받는다.** 막으려면 공용 알림 관문을
  //    ON CONFLICT 로 바꿔야 해 모든 알림 타입에 영향이 간다. 최악이 중복 1건이라 감수한다(PR #532 리뷰).
  const { data: sentRows, error: sentError } = await admin
    .from("noti_mst")
    .select("mem_id")
    .eq("ref_id", gthrId)
    .eq("noti_type_enm", "gthr_seat")
    .in("mem_id", waiting);
  if (sentError) throw sentError;

  const already = new Set(((sentRows ?? []) as { mem_id: string }[]).map((r) => r.mem_id));
  const targets = waiting.filter((memId) => !already.has(memId));
  if (targets.length === 0) return [];

  const { notifiedMemIds } = await insertNotiMany({
    teamId,
    memIds: targets,
    notiTypeEnm: "gthr_seat",
    notiNm: seatNotiTitle(gthrNm),
    notiCont: SEAT_NOTI_BODY,
    refId: gthrId,
    refTypeEnm: "gathering",
  });

  // 실제로 저장된 수신자만 — 수신거부·INSERT 실패는 targets 에 있어도 받지 않았다.
  return notifiedMemIds;
}
