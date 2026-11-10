/**
 * 노티봇 허브(https://api.notibot.xyz) 발송 클라이언트.
 *
 * 전송은 공식 SDK(`@noti-bot/sdk`)가 맡는다 — 손으로 짠 fetch 와 와이어 포맷은 같지만,
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
import { NotiBot, isNotiBotError, type NotiBotErrorJSON } from "@noti-bot/sdk";

import { env } from "@/lib/env";
import { recordKakaoSend, type KakaoSendSource } from "@/lib/kakao/send-log";
import { getTeamCfgStrict } from "@/lib/team-cfg/read";

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
  /**
   * 일부러 보내지 않은 이유. 보냈거나 실패했으면 undefined. **둘 다 실패가 아니라 이력에 남기지 않는다.**
   * - `disabled` — 이 환경에 노티봇 키가 없다(로컬·미리보기 안전장치)
   * - `no_room` — 이 팀이 카톡방을 설정하지 않았다(그 팀은 카톡 공지를 안 쓴다 — 예: 울산)
   * 설정을 **못 읽은** 경우는 여기가 아니라 `failure`(이력에 남는다)로 온다 — 미설정과 섞이면 기강 공지가 조용히 끊긴다.
   */
  skipped?: "disabled" | "no_room";
  /**
   * 허브가 **같은 `requestId` 로 이미 접수한 요청**이라 새로 보내지 않았다(`SendMessageResult.duplicate`).
   * `ok` 는 그대로 true 다 — 호출부(모임 공지 등)에겐 "톡방에 그 공지가 있다"는 사실이 같기 때문이다.
   * 새로 나간 건과 구분해야 하는 곳(MCP 공지 응답·발송 이력)만 이 값을 본다.
   */
  duplicate?: true;
  /** 실패했을 때의 분류. 발송 이력에 그대로 저장된다. */
  failure?: NotiBotErrorJSON;
};

export type SendKakaoOptions = {
  /**
   * 어느 팀 공지인가. **방은 이 팀의 설정(`team_cfg` `kakao.room_id`)에서 고른다.**
   * 예전엔 환경변수 방 하나로 보내 울산 모임 공지가 기강 단톡방으로 샜다. 방이 없는 팀은 보내지 않는다.
   */
  teamId: string;
  /**
   * 방. 이름이나 고정 ID(UUID) — 어드민 다시 보내기가 이력의 값을 그대로 넘긴다(그 이력은 같은 팀 것만).
   * 생략하면 팀 설정의 방.
   */
  room?: string | null;
  /** 멱등 키. 같은 사건(예: 모임 등록 1건)에 고정값을 주면 허브가 중복 발송을 막는다. */
  requestId?: string;
  /**
   * 진짜 카톡 태그로 부를 사람 이름(예: `["이현근"]`). 본문의 `@이름` 자리가 태그가 되고, 없으면
   * 맨 앞에 붙는다. 그 방 참여자 한 명으로 정해지지 않으면 허브가 보내지 않고
   * `mention_name_unknown` / `mention_name_ambiguous` 로 거절한다 — 엉뚱한 사람을 부르지 않는다.
   */
  mentions?: string[];
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RoomTarget = { roomId: string } | { room: string };

function toTarget(value: string): RoomTarget {
  return UUID_RE.test(value) ? { roomId: value } : { room: value };
}

/**
 * 보낼 방. 명시한 값(다시 보내기) → 팀 설정의 방. **다른 팀 방이나 환경변수 방으로 대신 보내지 않는다.**
 * (환경변수 `KAKAO_ROOM_ID`·`KAKAO_ROOM` 은 더 이상 읽지 않는다 — 기강 방은 기강 팀 설정으로 옮겼다.)
 */
async function roomTarget(teamId: string, explicit?: string | null): Promise<RoomTarget | null> {
  if (explicit) return toTarget(explicit);
  // 엄격 조회 — 조회 실패를 "방 없음"으로 바꾸지 않는다(호출부가 실패 이력으로 남긴다)
  const roomId = await getTeamCfgStrict(teamId, "kakao.room_id");
  return roomId ? toTarget(roomId) : null;
}

const apiKeyFromEnv = () => env.KAKAO_SERVICE_API_KEY ?? env.KAKAO_WEBHOOK_SECRET;

/**
 * 본문 길이 상한. SDK 가 이걸 넘으면 허브에 보내기 전에 `TypeError` 로 거절한다 —
 * 미리 검증하는 쪽(MCP 도구 등)이 같은 숫자를 보게 여기 하나로 둔다.
 */
export const KAKAO_MESSAGE_MAX_LENGTH = 4000;

/** 멱등 키 길이 상한(SDK 검증과 같은 값). */
export const KAKAO_REQUEST_ID_MAX_LENGTH = 128;

/**
 * 이 팀 공지가 어느 방으로 가는가 — 발송 이력에 남는 값(방 ID 또는 이름)과 같다.
 * 노티봇이 꺼진 환경이거나 이 팀에 방이 없으면 null. 보내기 전 미리보기용.
 */
export async function defaultKakaoRoom(teamId: string): Promise<string | null> {
  if (!hubOrigin() || !apiKeyFromEnv()) return null;
  // 미리보기·안내용이라 설정을 못 읽으면 "없음"으로 물러난다(조회 실패 로그는 read.ts 가 이미 남겼다).
  // 실제 발송(sendKakao)은 같은 실패를 실패 이력으로 남긴다.
  const target = await roomTarget(teamId).catch(() => null);
  if (!target) return null;
  return "room" in target ? target.room : target.roomId;
}

/**
 * 이 팀의 노티봇 발송이 켜져 있는가(허브·키가 있고 팀 방이 있다). "단톡방에도 공지했어요" 같은 안내가
 * `sendKakao` 와 다른 기준으로 판정하면 보내지도 않고 보냈다고 말하게 된다.
 */
export async function isKakaoConfigured(teamId: string): Promise<boolean> {
  return (await defaultKakaoRoom(teamId)) !== null;
}

/**
 * 카톡방에 한 줄 보낸다. 성공·실패 모두 `kakao_send_hist` 에 한 행을 남긴다.
 *
 * @param message 보낼 본문.
 */
export async function sendKakao(
  message: string,
  opts: SendKakaoOptions,
): Promise<KakaoSendResult> {
  const origin = hubOrigin();
  const apiKey = apiKeyFromEnv();

  // 미설정이면 조용히 끈다 — 로컬·preview 가 실제 톡방에 쏘지 않게 하는 안전장치가 이거다.
  // 환경변수(허브·키)를 넣은 환경에서만 발송된다. 키가 없으면 허브가 어차피 401 이므로 같이 묶는다.
  if (!origin || !apiKey) {
    console.info("[kakao] 발송 비활성(환경변수 미설정) — skip", { bytes: message.length });
    return { ok: false, skipped: "disabled" };
  }
  // 이 팀에 방이 없으면 보내지 않는다 — 다른 팀 방으로 대신 보내는 일은 없다.
  // 방을 **못 읽었으면** 실패다 — 이력에 남겨 관리자 화면 실패 건수에 잡히게 한다(미설정과 다르다).
  let target: RoomTarget | null;
  try {
    target = await roomTarget(opts.teamId, opts.room);
  } catch (e) {
    const failure: NotiBotErrorJSON = {
      name: "TeamCfgReadError",
      message: e instanceof Error ? e.message : String(e),
      retryable: true,
    };
    console.error("[kakao] 카톡방 설정을 못 읽어 보내지 못함", { teamId: opts.teamId, failure });
    await recordKakaoSend({
      teamId: opts.teamId,
      room: "(설정 조회 실패)",
      message,
      requestId: opts.requestId ?? crypto.randomUUID(),
      source: opts.source ?? null,
      resend: opts.resend ?? false,
      status: "failed",
      failure,
      actorMemId: opts.actorMemId ?? null,
    }).catch((err) => console.error("[kakao] 발송 이력 기록 실패", err));
    return { ok: false, failure };
  }
  if (!target) {
    console.info("[kakao] 이 팀은 카톡방 미설정 — skip", { teamId: opts.teamId, bytes: message.length });
    return { ok: false, skipped: "no_room" };
  }

  // 이력은 다시 보내기의 대상이기도 하다. 고정 ID 로 보냈으면 표시 이름으로 바꾸지 않는다.
  // 이름 변경·동명 방이 있어도 재시도 대상이 바뀌지 않게 한다.
  const log = {
    teamId: opts.teamId,
    room: "room" in target ? target.room : target.roomId,
    message,
    requestId: opts.requestId ?? null,
    source: opts.source ?? null,
    resend: opts.resend ?? false,
  };

  // 발송과 기록을 한 try 로 묶지 않는다 — 묶으면 **이력 기록이 터질 때 성공한 발송이 실패로
  // 뒤집힌다**. 공지는 이미 톡방에 가 있는데 호출부는 못 갔다고 믿는 상태가 가장 나쁘다.
  let result: KakaoSendResult;
  // 응답 유실 때도 같은 멱등 키를 기록해야 수동 재시도가 중복 발송을 만들지 않는다.
  const requestId = opts.requestId ?? crypto.randomUUID();

  try {
    const bot = new NotiBot({
      baseUrl: origin,
      apiKey,
      timeoutMs: TIMEOUT_MS,
      ...(opts.fetchFn ? { fetch: opts.fetchFn } : {}),
    });
    const sent = await bot.sendMessage({
      ...target,
      text: message,
      requestId,
      ...(opts.mentions?.length ? { mentions: opts.mentions } : {}),
    });

    console.info("[kakao] 허브 접수", { bytes: message.length, room: log.room, queued: sent.queued, duplicate: sent.duplicate === true });
    // 접수 성공은 수신자 전달 확인이 아니다. SDK 는 응답의 request_id 일치도 검증한다.
    result = sent.duplicate === true ? { ok: true, duplicate: true } : { ok: true };
  } catch (error) {
    // SDK 가 던지는 것이 아닌 예외(우리 쪽 버그)도 여기로 온다. 호출부는 이미 커밋된 뒤라
    // 되돌릴 수 없으므로 삼키되, 분류를 남겨 어드민에서 원인이 보이게 한다.
    const failure = isNotiBotError(error)
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
    status: result.duplicate ? "duplicate" : result.ok ? "success" : "failed",
    ...(result.failure ? { failure: result.failure } : {}),
    actorMemId: opts.actorMemId ?? null,
  }).catch((e) => console.error("[kakao] 발송 이력 기록 실패", e));

  return result;
}
