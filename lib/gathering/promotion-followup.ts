import "server-only";

import { notifyOpenSeat as sendOpenSeatNotice } from "@/lib/gathering/seat-notice";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import type { createUntypedAdminClient } from "@/lib/supabase/admin";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";

type SupabaseLike = ReturnType<typeof createUntypedAdminClient>;

/** 무엇 때문에 대기열이 움직였나 — 승급 알림 제목만 갈린다. */
export type PromotionCause = "cancel" | "capacity";

const PROMO_NOTI_TITLE: Record<PromotionCause, (gthrNm: string) => string> = {
  cancel: (gthrNm) => `'${gthrNm}' 자리가 나서 참석이 확정됐어요`,
  capacity: (gthrNm) => `'${gthrNm}' 정원이 늘어 참석이 확정됐어요`,
};

export const PROMO_NOTI_BODY = "대기 중이던 모임에 자리가 생겨 자동으로 참석 처리했어요.";

/**
 * 대기열이 움직인 뒤의 뒷처리 — **승급 알림 · 빈 자리 알림 · 승급자 칭호 평가.**
 *
 * 대기열을 움직이는 세 경로(본인 취소 · 운영진 제거 · 정원 증가)가 **이 함수 하나**를 부른다.
 * 예전엔 경로마다 따로 만들어서, 칭호 평가는 본인 취소에만 있었다 — 운영진 제거나 정원 증가로
 * 올라간 사람은 정확히 정원 번째여도 `막차`를 못 받았다(PR #532 점검). 빈 자리 알림도 정원 증가
 * 경로에서 빠져 있었다. 한 곳에 모아 두면 새 경로가 생겨도 셋이 같이 따라온다.
 *
 * 판정값(`promoted`, `notifyOpenSeat`)은 앱이 만들지 않는다 — RPC 가 트랜잭션 안에서 정한 것을
 * 그대로 받는다(`parseCancelResult`).
 *
 * 세 단계는 서로 독립이라 같이 출발시키고, 각자 실패를 기록만 한다. 이미 끝난 승급을 되돌리지
 * 않으며 **이 함수는 reject 하지 않는다** — 호출부는 `after()` 안에서 그냥 부르면 된다.
 */
export async function runPromotionFollowups(
  admin: SupabaseLike,
  {
    teamId,
    gthrId,
    gthrNm,
    cause,
    promoted,
    notifyOpenSeat,
  }: {
    teamId: string;
    gthrId: string;
    gthrNm: string;
    cause: PromotionCause;
    promoted: string[];
    notifyOpenSeat: boolean;
  },
): Promise<void> {
  if (promoted.length === 0 && !notifyOpenSeat) return;

  await Promise.all([
    // 대기 → 참석으로 올라간 사람에게. 이 알림이 없으면 자리가 났다는 걸 아무도 모른다 —
    // 대기열의 존재 이유 자체다. 수신거부는 gthr_promo 자체 설정으로 판단(관문이 거른다).
    promoted.length
      ? insertNotiMany({
          teamId,
          memIds: promoted,
          notiTypeEnm: "gthr_promo",
          notiNm: PROMO_NOTI_TITLE[cause](gthrNm),
          notiCont: PROMO_NOTI_BODY,
          refId: gthrId,
          refTypeEnm: "gathering",
        })
          .then(() => undefined)
          .catch((e) => console.error("[gthr_promo] 승급 알림 발송 실패", e))
      : Promise.resolve(),

    // 선착순 구간에 실제 빈자리가 생겼으면 대기자 전원에게(모임당 1회) — seat-notice 참고.
    notifyOpenSeat
      ? sendOpenSeatNotice(admin, { gthrId, gthrNm, teamId })
          .then(() => undefined)
          .catch((e) => console.error("[gthr_seat] 빈 자리 알림 발송 실패", e))
      : Promise.resolve(),

    // 승급도 참석 확정이다 — 안 돌리면 정확히 정원 번째로 올라간 사람이 `막차`를 못 받는다.
    promoted.length ? evaluatePromotedTitles(admin, teamId, promoted) : Promise.resolve(),
  ]);
}

/** RPC 는 mem_id 만 주므로 team_mem_id 를 찾아 참석 계열 칭호를 평가한다. */
async function evaluatePromotedTitles(
  admin: SupabaseLike,
  teamId: string,
  promoted: string[],
): Promise<void> {
  try {
    const { data: rels, error } = await admin
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .in("mem_id", promoted);
    if (error) throw error;

    await Promise.all(
      ((rels ?? []) as { team_mem_id: string }[]).map((r) =>
        evaluateAndGrantTitles({
          trigger: "gathering_attend",
          teamId,
          teamMemId: r.team_mem_id,
        }).catch((e) => console.error("[title-engine] 승급자 칭호 평가 실패", e)),
      ),
    );
  } catch (e) {
    console.error("[title-engine] 승급자 조회 실패", e);
  }
}
