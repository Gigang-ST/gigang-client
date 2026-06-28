import "server-only";
import webpush from "web-push";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

/**
 * 웹 푸시 발송 유틸 (Node 런타임 전용).
 *
 * ⚠️ web-push는 Node API에 의존하므로, 이 모듈을 호출하는 서버 액션/route는
 *    반드시 Node 런타임이어야 한다 (Edge 런타임 불가).
 *
 * 발송은 인앱 알림(insertNoti)과 짝으로 동작한다 — noti_mst INSERT 직후 호출되며,
 * noti_pref_cfg로 꺼진 타입은 insertNoti가 INSERT 자체를 스킵하므로 푸시도 자동으로 안 나간다.
 */

// VAPID 설정은 모듈 로드 시점이 아니라 첫 발송 시점에 1회만 한다.
// 모듈 로드 시 setVapidDetails를 호출하면 빌드(page data 수집) 단계에서
// 환경변수가 비어 "No subject set" 에러로 빌드가 실패한다.
let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  if (
    !env.VAPID_SUBJECT ||
    !env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !env.VAPID_PRIVATE_KEY
  ) {
    // 키 미설정(예: 환경변수 누락) — 발송을 건너뛴다(빌드/로컬에서 안전).
    return false;
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  vapidConfigured = true;
  return true;
}

/** 서비스워커 push 이벤트에서 받을 페이로드 */
export type PushPayload = {
  title: string;
  body?: string;
  /** 클릭 시 이동할 딥링크 (notificationclick에서 사용) */
  url?: string;
  /** 알림 그룹핑/중복 제거용 태그 */
  tag?: string;
};

/**
 * 특정 멤버 1명의 모든 기기(구독)에 푸시를 발송한다.
 * - 410 Gone: 구독 만료/취소 → push_sub_rel에서 즉시 삭제
 * - 그 외 오류: 콘솔 로깅만 하고 재시도 없이 무시 (알림 특성상 재시도 불필요)
 */
type SubRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
  mem_id: string;
};

/** 구독 1건에 발송. 만료(410/404)면 DB에서 제거. (admin은 재사용) */
async function sendToSub(
  admin: ReturnType<typeof createUntypedAdminClient>,
  sub: SubRow,
  body: string,
): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
      {
        // high urgency: 안드로이드 절전(Doze) 중에도 즉시 전달 시도 (간헐 누락 완화)
        urgency: "high",
        // 4시간 내 미전달 시 폐기 (오래된 알림 안 보냄)
        TTL: 60 * 60 * 4,
      },
    );
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 410 || statusCode === 404) {
      // 구독 만료/취소 → DB에서 제거 (삭제 실패 시 좀비 구독 누적 방지 위해 로깅)
      const { error: delErr } = await admin
        .from("push_sub_rel")
        .delete()
        .eq("endpoint", sub.endpoint);
      if (delErr) {
        console.error("[push] 만료 구독 삭제 실패", sub.endpoint, delErr.message);
      }
    } else {
      console.error("[push] 발송 실패", statusCode, sub.endpoint);
    }
  }
}

/**
 * 특정 멤버 1명의 모든 기기(구독)에 푸시를 발송한다.
 */
export async function sendPushToMember(
  memId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapidConfigured()) return;

  const admin = createUntypedAdminClient();
  const { data: subs, error } = await admin
    .from("push_sub_rel")
    .select("endpoint, p256dh, auth, mem_id")
    .eq("mem_id", memId);

  if (error) {
    console.error("[push] 구독 조회 실패", memId, error.message);
    return;
  }
  if (!subs || subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(subs.map((sub: SubRow) => sendToSub(admin, sub, body)));
}

/**
 * 여러 멤버에게 각자의 payload로 푸시를 발송한다 (구독 조회 1회 + 병렬 발송).
 * 멤버마다 알림 내용(제목·딥링크·tag)이 다르므로 memId → payload 맵을 받는다.
 *
 * 대량 발송(팀 전체 등)에서 멤버별 개별 조회(N+1)를 피하기 위한 배치 경로.
 */
export async function sendPushToMembers(
  payloadByMemId: Map<string, PushPayload>,
): Promise<void> {
  if (!ensureVapidConfigured()) return;
  const memIds = [...payloadByMemId.keys()];
  if (memIds.length === 0) return;

  const admin = createUntypedAdminClient();
  const { data: subs, error } = await admin
    .from("push_sub_rel")
    .select("endpoint, p256dh, auth, mem_id")
    .in("mem_id", memIds);

  if (error) {
    console.error("[push] 구독 일괄 조회 실패", error.message);
    return;
  }
  if (!subs || subs.length === 0) return;

  await Promise.all(
    (subs as SubRow[]).map((sub) => {
      const payload = payloadByMemId.get(sub.mem_id);
      if (!payload) return Promise.resolve();
      return sendToSub(admin, sub, JSON.stringify(payload));
    }),
  );
}
