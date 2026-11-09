import type { SupabaseClient } from "@supabase/supabase-js";

import {
  defaultKakaoRoom,
  KAKAO_MESSAGE_MAX_LENGTH,
  KAKAO_REQUEST_ID_MAX_LENGTH,
  sendKakao,
} from "@/lib/kakao/notify";
import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 기강 운영 MCP — write 도구 `send_kakao_notice`(#631). 단톡방에 운영진이 자유 문구 공지를 보낸다.
 *
 * ## 왜 필요한가
 * 노티봇 공지는 모임 등록·수정·취소 같은 **정해진 사건에만** 나간다. 자유 문구로 알리려면 허브 키를
 * 각자 PC에 들고 직접 불러야 했다 — 비밀값이 퍼지고 발송 이력도 사이트에 안 남는다. 이 도구는
 * 키를 서버에 둔 채 `sendKakao()` 를 그대로 불러, **어드민 발송 이력(`admin/kakao`)에 출처
 * `mcp_notice` 와 보낸 사람이 남게** 한다.
 *
 * ## 안전장치
 * - **admin 전용**(`send_push` 와 같은 급) — 되돌릴 수 없고 크루 전원에게 보인다. 거부는 발송·감사
 *   이전에 일어난다.
 * - **방은 인자로 받지 않는다.** 환경 설정(`KAKAO_ROOM_ID` → `KAKAO_ROOM`)만 쓴다 — 엉뚱한 방으로
 *   새는 길을 아예 두지 않는다.
 * - **재시도하지 않는다**(`notify.ts` 원칙 — 중복이 유실보다 나쁘다). 실패면 분류를 돌려주고 판단은
 *   사람이 한다. 같은 `request_id` 로 다시 부르면 허브가 중복을 막고, 응답은
 *   `status: "duplicate"` 다(새로 나가지 않았다는 뜻).
 * - `request_id` 를 안 주면 여기서 만들어 응답에 싣는다 — 다시 보낼 때 같은 값을 쓰라고.
 *   dry_run 도 만들어 돌려준다: 미리보기 → 확인 → 같은 id 로 실제 발송하면, 같은 공지를 두 번
 *   부르더라도 허브가 두 번 보내지 않는다.
 * - 노티봇이 꺼진 환경(local·preview)은 `skipped` — `sendKakao` 가 판정한다.
 *
 * `sendKakao` 는 server-only 체인(`send-log.ts`)이라 테스트에선 `vi.mock("@/lib/kakao/notify")` 가
 * 필수다 — 실제 단톡방 발송도 그 mock 이 막는다.
 */

type Db = SupabaseClient<Database>;

/** 태그로 부를 이름 수 상한. 공지 한 건에 이보다 많이 부르는 건 실수일 가능성이 크다. */
export const KAKAO_NOTICE_MAX_MENTIONS = 20;

export type SendKakaoNoticeInput = {
  message: string;
  mentions?: string[];
  request_id?: string;
  dry_run?: boolean;
};

/** 실패 분류 — 허브 SDK 의 오류 분류에서 사람이 판단하는 데 필요한 것만. */
export type KakaoNoticeFailure = {
  /** 예: NotiBotApiError / NotiBotTimeoutError / NotiBotTransportError. */
  name: string;
  /** 허브 오류 코드(예: mention_name_unknown, room_not_found, rate_limited). */
  code: string | null;
  http_status: number | null;
  message: string;
  /** 같은 request_id 로 다시 보내도 안전한가. 자동 재시도 지시가 아니다. */
  retryable: boolean;
};

export type SendKakaoNoticeResult = {
  dry_run: boolean;
  /**
   * - `preview`: dry_run — 보내지 않았다.
   * - `sent`: 허브가 접수했다(카톡 전달 확인은 아니다).
   * - `duplicate`: 같은 `request_id` 를 허브가 이미 받아 둬서 **새로 보내지 않았다** — 단톡방엔 앞선
   *   한 건만 있다. 실패가 아니니 다시 보낼 일도 없다. 발송 이력에도 `duplicate` 로 남는다.
   * - `skipped`: 이 환경엔 노티봇이 설정돼 있지 않아 보내지 않았다.
   * - `failed`: 허브가 거절했거나 닿지 않았다 — `failure` 참고.
   */
  status: "preview" | "sent" | "duplicate" | "skipped" | "failed";
  /** 보낼(보낸) 방 — 환경 설정의 방 ID 또는 이름. 노티봇이 꺼진 환경이면 null. */
  room: string | null;
  /** 이 환경에서 노티봇이 켜져 있는가 — dry_run 이면 "실제로 부르면 보내지는가". */
  will_send: boolean;
  message: string;
  mentions: string[];
  /** 멱등 키. 다시 보낼 땐 **이 값을 그대로** 넘겨야 중복 발송이 안 난다. */
  request_id: string;
  failure: KakaoNoticeFailure | null;
  /** MCP 감사행 id(발송 이력의 출처 id 와 같다). dry_run 이면 null. */
  audit_id: string | null;
};

/** 비-admin 호출 거부. 공용 `ToolDeniedError` 하위라 라우트가 사유를 그대로 노출한다. */
export class SendKakaoNoticeDeniedError extends ToolDeniedError {
  constructor(message = "단톡방 공지는 운영진(admin)만 보낼 수 있습니다.") {
    super(message);
    this.name = "SendKakaoNoticeDeniedError";
  }
}

/** 태그 이름 정리 — 앞뒤 공백 제거, 빈 값·중복 제거(입력 순서 보존). */
function normalizeMentions(raw: string[] | undefined): string[] {
  const names = (raw ?? []).map((n) => n.trim()).filter((n) => n.length > 0);
  return Array.from(new Set(names));
}

/**
 * `send_kakao_notice` 본체. admin 게이트 → 검증 → (dry_run 이면 미리보기로 종료) → 발송 → 감사행.
 *
 * 발송 실패는 던지지 않고 `status: "failed"` 로 돌려준다 — 실패해도 `request_id` 와 분류가
 * 호출자에게 가야 다시 보낼지 사람이 판단할 수 있다.
 *
 * @param supabase service-role 클라이언트(라우트에서 주입). 감사행 기록에만 쓴다.
 * @param ctx      operator 컨텍스트. 보낸 사람(`mem_id`)은 여기서만 나온다.
 * @param input    도구 입력.
 * @throws SendKakaoNoticeDeniedError 비-admin — 아무것도 보내지 않는다.
 * @throws ToolInputError             본문이 비었거나 길이 상한을 넘음, request_id 형식 오류.
 */
export async function sendKakaoNotice(
  supabase: Db,
  ctx: OperatorContext,
  input: SendKakaoNoticeInput,
): Promise<SendKakaoNoticeResult> {
  if (!ctx.is_admin) {
    throw new SendKakaoNoticeDeniedError();
  }

  // 라우트 스키마가 길이를 먼저 막지만, 공백만 있는 본문은 길이 검사를 통과한다 — SDK 가
  // 그걸 TypeError 로 던지면 "failed" 로 이력에 남아 다시 보내기 대상처럼 보인다. 여기서 끊는다.
  const message = input.message;
  if (!message.trim()) {
    throw new ToolInputError("message: 보낼 내용을 입력하세요.");
  }
  if (message.length > KAKAO_MESSAGE_MAX_LENGTH) {
    throw new ToolInputError(
      `message: 단톡방 공지는 ${KAKAO_MESSAGE_MAX_LENGTH}자까지 보낼 수 있습니다(지금 ${message.length}자).`,
    );
  }

  const mentions = normalizeMentions(input.mentions);
  if (mentions.length > KAKAO_NOTICE_MAX_MENTIONS) {
    throw new ToolInputError(
      `mentions: 태그는 한 번에 ${KAKAO_NOTICE_MAX_MENTIONS}명까지 부를 수 있습니다.`,
    );
  }

  const requestedId = input.request_id?.trim();
  if (input.request_id !== undefined && !requestedId) {
    throw new ToolInputError("request_id: 비워 둘 거면 아예 빼 주세요(서버가 만듭니다).");
  }
  if (requestedId && requestedId.length > KAKAO_REQUEST_ID_MAX_LENGTH) {
    throw new ToolInputError(
      `request_id: ${KAKAO_REQUEST_ID_MAX_LENGTH}자 이하여야 합니다.`,
    );
  }
  const requestId = requestedId || crypto.randomUUID();

  // 토큰의 팀 방 — 방이 없는 팀이면 null 이고 보내지 않는다(다른 팀 방으로 새지 않는다)
  const room = await defaultKakaoRoom(ctx.team_id);

  if (input.dry_run) {
    return {
      dry_run: true,
      status: "preview",
      room,
      will_send: room !== null,
      message,
      mentions,
      request_id: requestId,
      failure: null,
      audit_id: null,
    };
  }

  // 감사행 id 를 먼저 뽑아 발송 이력의 출처 id 로 싣는다 — 이력 한 줄에서 MCP 감사행으로 이어진다.
  const auditId = crypto.randomUUID();
  const sent = await sendKakao(message, {
    teamId: ctx.team_id,
    requestId,
    ...(mentions.length ? { mentions } : {}),
    source: { type: "mcp_notice", id: auditId },
    actorMemId: ctx.mem_id,
  });

  const status: SendKakaoNoticeResult["status"] = sent.duplicate
    ? "duplicate"
    : sent.ok
      ? "sent"
      : sent.skipped
        ? "skipped"
        : "failed";
  const failure: KakaoNoticeFailure | null =
    status === "failed"
      ? {
          name: sent.failure?.name ?? "UnknownError",
          code: sent.failure?.code ?? null,
          http_status: sent.failure?.status ?? null,
          message: sent.failure?.message ?? "발송에 실패했습니다.",
          retryable: sent.failure?.retryable ?? false,
        }
      : null;

  // 감사행은 결과와 무관하게 남긴다 — 실패·skip 도 "누가 무엇을 보내려 했나"다. 기록 실패는
  // 발송을 되돌리지 않는다(이미 나갔을 수 있다) — 로깅만.
  const { error: auditErr } = await supabase.from("mcp_audit_log").insert({
    audit_id: auditId,
    actor_mem_id: ctx.mem_id,
    team_id: ctx.team_id,
    tool_nm: "send_kakao_notice",
    params_json: {
      message,
      mentions,
      request_id: requestId,
      room,
      status,
      ...(failure ? { failure_name: failure.name, failure_code: failure.code } : {}),
    },
    result_summary: `send_kakao_notice ${status}: request_id=${requestId}`,
  });
  if (auditErr) {
    console.error("[mcp] send_kakao_notice 감사 기록 실패", auditErr.message);
  }

  return {
    dry_run: false,
    status,
    room,
    will_send: room !== null,
    message,
    mentions,
    request_id: requestId,
    failure,
    audit_id: auditId,
  };
}
