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
  const { data: waitRows } = await admin
    .from("gthr_wait_rel")
    .select("mem_id")
    .eq("gthr_id", gthrId)
    .eq("wait_st_cd", "waiting");

  const waiting = ((waitRows ?? []) as { mem_id: string }[]).map((w) => w.mem_id);
  if (waiting.length === 0) return [];

  // 이 모임에 대해 이미 gthr_seat 를 받은 사람 제외(1회 제한).
  // del_yn 은 보지 않는다 — 알림을 지운 것과 "안 받은 것"은 다르다.
  const { data: sentRows } = await admin
    .from("noti_mst")
    .select("mem_id")
    .eq("ref_id", gthrId)
    .eq("noti_type_enm", "gthr_seat")
    .in("mem_id", waiting);

  const already = new Set(((sentRows ?? []) as { mem_id: string }[]).map((r) => r.mem_id));
  const targets = waiting.filter((memId) => !already.has(memId));
  if (targets.length === 0) return [];

  await insertNotiMany({
    teamId,
    memIds: targets,
    notiTypeEnm: "gthr_seat",
    notiNm: seatNotiTitle(gthrNm),
    notiCont: SEAT_NOTI_BODY,
    refId: gthrId,
    refTypeEnm: "gathering",
  });

  return targets;
}
