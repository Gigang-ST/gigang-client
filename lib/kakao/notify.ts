/**
 * 카카오 허브(https://kakao-api.jeongmin.dev) 발송 클라이언트.
 *
 * 계약: `POST {KAKAO_WEBHOOK_URL}` + `Authorization: Bearer {KAKAO_WEBHOOK_SECRET}` + `{ room, msg, request_id? }`.
 * KAKAO_WEBHOOK_URL 은 `https://kakao-api.jeongmin.dev/v1/messages`, KAKAO_WEBHOOK_SECRET 은 허브 admin 에서 발급한
 * gigang 서비스의 API 키(`kb_…`). 허브는 202 로 큐에 넣고 봇폰으로 보낸다. 문서: https://kakao-api.jeongmin.dev/docs
 *
 * **재시도하지 않는다.** 허브는 `request_id` 가 같으면 두 번 보내지 않지만, 공지마다 id 를 붙이지 않는 호출도 있어서
 * 여기서 재시도하면 같은 공지가 톡방에 여러 번 뜰 수 있다 — 유실보다 중복이 나쁘다.
 *
 * **던지지 않는다.** 호출부는 모임 등록·수정·취소가 이미 성공한 뒤다. 톡 발송 실패로
 * 그 작업을 되돌릴 수 없고 되돌려서도 안 되므로, 실패는 로그로만 남기고 `false`를 돌려준다.
 */
import { env } from "@/lib/env";

export type KakaoSendResult = {
  /** 브리지가 2xx 로 받았는가. 미설정(비활성)이면 false. */
  ok: boolean;
  /** 보내지 않은 이유(미설정 등). 보냈으면 undefined. */
  skipped?: "disabled";
};

/**
 * 카톡방에 한 줄 보낸다.
 *
 * @param message 보낼 본문.
 * @param opts.room 방 이름. 생략하면 `KAKAO_ROOM`.
 * @param opts.requestId 멱등 키. 같은 사건(예: 모임 등록 1건)에 고정값을 주면 허브가 중복 발송을 막는다.
 * @param opts.fetchFn 테스트 주입용.
 */
export async function sendKakao(
  message: string,
  opts: { room?: string | null; requestId?: string; fetchFn?: typeof fetch } = {},
): Promise<KakaoSendResult> {
  const url = env.KAKAO_WEBHOOK_URL;
  const room = opts.room ?? env.KAKAO_ROOM;
  const fetchFn = opts.fetchFn ?? fetch;

  // 미설정이면 조용히 끈다 — 로컬·preview 가 실제 톡방에 쏘지 않게 하는 안전장치가 이거다.
  // 환경변수를 넣은 환경에서만 발송된다.
  if (!url || !room) {
    console.info("[kakao] 발송 비활성(환경변수 미설정) — skip", { bytes: message.length });
    return { ok: false, skipped: "disabled" };
  }

  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.KAKAO_WEBHOOK_SECRET ? { Authorization: `Bearer ${env.KAKAO_WEBHOOK_SECRET}` } : {}),
      },
      body: JSON.stringify({ room, msg: message, ...(opts.requestId ? { request_id: opts.requestId } : {}) }),
    });

    if (!res.ok) {
      // CF 502 는 본문이 HTML 한 페이지라 로그를 통째로 오염시킨다 — 앞부분만 남긴다.
      const body = (await res.text().catch(() => "")).slice(0, 200);
      console.error(`[kakao] 발송 응답 실패 ${res.status} (재시도 안 함 — 중복 방지): ${body}`);
      return { ok: false };
    }

    console.info("[kakao] 발송", { bytes: message.length, room });
    return { ok: true };
  } catch (e) {
    console.error("[kakao] 발송 실패(네트워크)", e);
    return { ok: false };
  }
}
