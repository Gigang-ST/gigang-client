/**
 * 카카오 허브(https://kakao-api.jeongmin.dev) 발송 클라이언트.
 *
 * 전송은 공식 SDK(`@kakao-bot/sdk`)가 맡는다 — 손으로 짠 fetch 와 와이어 포맷은 같지만,
 * 타임아웃·오류 분류·`Retry-After` 해석을 SDK 가 들고 있다. 특히 **타임아웃과 네트워크 단절의
 * 구분은 SDK 만 할 수 있다**(자기 AbortSignal 이 터졌는지는 바깥에서 알 길이 없다).
 *
 * **재시도하지 않는다.** 허브는 `request_id` 가 같으면 두 번 보내지 않지만, 공지마다 id 를 붙이지
 * 않는 호출도 있어서 여기서 재시도하면 같은 공지가 톡방에 여러 번 뜰 수 있다 — 유실보다 중복이 나쁘다.
 * SDK 가 `retryable` 을 알려줘도 여기서 자동으로 되보내지 않는다. 그 판단은 어드민 발송 이력에서
 * **사람이** 한다.
 *
 * **던지지 않는다.** 호출부는 모임 등록·수정·취소가 이미 성공한 뒤다. 톡 발송 실패로
 * 그 작업을 되돌릴 수 없고 되돌려서도 안 되므로, 실패는 기록으로만 남기고 `ok: false` 를 돌려준다.
 */
import { KakaoBot, isKakaoError, type KakaoErrorJSON } from "@kakao-bot/sdk";

import { env } from "@/lib/env";
import { recordKakaoSend, type KakaoSendSource } from "@/lib/kakao/send-log";

/**
 * 허브 응답을 기다리는 시간.
 *
 * 발송은 전부 `after()` 안에서 일어나므로 사용자를 붙잡진 않지만, 서버리스 함수는 그동안 살아 있다.
 * 허브가 가정용 회선 뒤에 있어 회선이 끊기면 연결이 그냥 매달린다 — 한도를 안 걸면 그대로
 * 함수 타임아웃까지 간다.
 */
const TIMEOUT_MS = 10_000;

export type KakaoSendResult = {
  /** 허브가 2xx 로 접수했는가. 미설정(비활성)이면 false. */
  ok: boolean;
  /** 보내지 않은 이유(미설정 등). 보냈으면 undefined. */
  skipped?: "disabled";
  /** 실패했을 때의 분류. 발송 이력에 그대로 저장된다. */
  failure?: KakaoErrorJSON;
};

export type SendKakaoOptions = {
  /** 방 이름. 생략하면 `KAKAO_ROOM`. */
  room?: string | null;
  /** 멱등 키. 같은 사건(예: 모임 등록 1건)에 고정값을 주면 허브가 중복 발송을 막는다. */
  requestId?: string;
  /** 어느 사건이 보낸 것인지 — 발송 이력에서 출처를 가리는 데만 쓴다. */
  source?: KakaoSendSource;
  /** 어드민에서 다시 보낸 건인가. 이력에 그렇게 남는다. */
  resend?: boolean;
  /** 어드민에서 다시 보낸 경우 누른 사람 — 이력에 남는다. */
  actorMemId?: string | null;
  /** 테스트 주입용. */
  fetchFn?: typeof fetch;
};

/**
 * 허브 주소.
 *
 * SDK 는 origin 을 받고 경로는 자기가 붙인다. 예전 환경변수(`KAKAO_WEBHOOK_URL`)는 `/v1/messages`
 * 까지 포함한 전체 주소라, 당분간 둘 다 받아 origin 으로 정규화한다 — 배포 환경변수를 바꾸기 전에
 * 코드가 먼저 올라가도 발송이 멈추지 않게.
 */
function hubOrigin(): string | null {
  const raw = env.KAKAO_HUB_URL ?? env.KAKAO_WEBHOOK_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    console.error("[kakao] 허브 주소가 URL 이 아니다 — 발송을 건너뛴다");
    return null;
  }
}

/**
 * 카톡방에 한 줄 보낸다. 성공·실패 모두 `kakao_send_hist` 에 한 행을 남긴다.
 *
 * @param message 보낼 본문.
 */
export async function sendKakao(
  message: string,
  opts: SendKakaoOptions = {},
): Promise<KakaoSendResult> {
  const origin = hubOrigin();
  const apiKey = env.KAKAO_WEBHOOK_SECRET;
  const room = opts.room ?? env.KAKAO_ROOM;

  // 미설정이면 조용히 끈다 — 로컬·preview 가 실제 톡방에 쏘지 않게 하는 안전장치가 이거다.
  // 환경변수를 넣은 환경에서만 발송된다. 키가 없으면 허브가 어차피 401 이므로 같이 묶는다.
  if (!origin || !apiKey || !room) {
    console.info("[kakao] 발송 비활성(환경변수 미설정) — skip", { bytes: message.length });
    return { ok: false, skipped: "disabled" };
  }

  const log = {
    room,
    message,
    requestId: opts.requestId ?? null,
    source: opts.source ?? null,
    resend: opts.resend ?? false,
  };

  // 발송과 기록을 한 try 로 묶지 않는다 — 묶으면 **이력 기록이 터질 때 성공한 발송이 실패로
  // 뒤집힌다**. 공지는 이미 톡방에 가 있는데 호출부는 못 갔다고 믿는 상태가 가장 나쁘다.
  let result: KakaoSendResult;
  let requestId = opts.requestId ?? null;

  try {
    const bot = new KakaoBot({
      baseUrl: origin,
      apiKey,
      timeoutMs: TIMEOUT_MS,
      ...(opts.fetchFn ? { fetch: opts.fetchFn } : {}),
    });
    const sent = await bot.sendMessage({
      room,
      text: message,
      ...(opts.requestId ? { requestId: opts.requestId } : {}),
    });

    console.info("[kakao] 발송", { bytes: message.length, room, queued: sent.queued });
    // 허브가 실제로 쓴 id 를 남긴다 — 안 넘겼으면 SDK 가 만들어 준 값이고,
    // 다시 보낼 때 그 값을 그대로 써야 허브가 중복을 막아 준다.
    requestId = sent.request_id;
    result = { ok: true };
  } catch (error) {
    // SDK 가 던지는 것이 아닌 예외(우리 쪽 버그)도 여기로 온다. 호출부는 이미 커밋된 뒤라
    // 되돌릴 수 없으므로 삼키되, 분류를 남겨 어드민에서 원인이 보이게 한다.
    const failure = isKakaoError(error)
      ? error.toJSON()
      : {
          name: "UnexpectedError",
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        };
    console.error("[kakao] 발송 실패 (재시도 안 함 — 중복 방지)", failure);
    result = { ok: false, failure };
  }

  await recordKakaoSend({
    ...log,
    requestId,
    status: result.ok ? "success" : "failed",
    ...(result.failure ? { failure: result.failure } : {}),
    actorMemId: opts.actorMemId ?? null,
  }).catch((e) => console.error("[kakao] 발송 이력 기록 실패", e));

  return result;
}
