/**
 * 발송 이력 기록(`kakao_send_hist`).
 *
 * **여기서 던지지 않는다.** 기록은 발송의 곁다리다 — 로그를 못 남겼다고 이미 나간 공지를
 * 되돌릴 수 없고, 기록 실패로 호출부(모임 등록 등)를 깨뜨리면 꼬리가 몸통을 흔드는 꼴이 된다.
 * 실패하면 콘솔에만 남기고 조용히 넘어간다.
 */
import "server-only";

import type { NotiBotErrorJSON } from "@noti-bot/sdk";

import { createUntypedAdminClient } from "@/lib/supabase/admin";

/** 어느 사건이 보냈는지. 이력 화면에서 출처 배지로 쓴다. */
export type KakaoSendSource = {
  type:
    | "gathering_created"
    | "gathering_updated"
    | "gathering_canceled"
    | "gathering_announce"
    | "pb_sess_open"
    /** 운영 MCP `send_kakao_notice` 로 운영진이 보낸 자유 문구 공지. id 는 MCP 감사행(`mcp_audit_log.audit_id`). */
    | "mcp_notice";
  id?: string | null;
};

export type RecordKakaoSendInput = {
  /** 어느 팀 공지였나 — 관리자 발송 이력·다시 보내기가 자기 팀 것만 다룬다 */
  teamId: string;
  room: string;
  message: string;
  requestId: string | null;
  source: KakaoSendSource | null;
  resend: boolean;
  /** `duplicate` = 같은 requestId 가 이미 접수돼 허브가 새로 보내지 않았다(성공으로 세지 않는다). */
  status: "success" | "failed" | "duplicate";
  failure?: NotiBotErrorJSON;
  /** 어드민에서 다시 보낸 경우 누른 사람. */
  actorMemId?: string | null;
};

export async function recordKakaoSend(input: RecordKakaoSendInput): Promise<void> {
  try {
    const supabase = createUntypedAdminClient();
    const { error } = await supabase.from("kakao_send_hist").insert({
      team_id: input.teamId,
      room_nm: input.room,
      msg_txt: input.message,
      request_id: input.requestId,
      status: input.status,
      err_name: input.failure?.name ?? null,
      err_msg: input.failure?.message ?? null,
      http_status: input.failure?.status ?? null,
      err_code: input.failure?.code ?? null,
      retryable: input.failure?.retryable ?? false,
      src_type: input.source?.type ?? null,
      src_id: input.source?.id ?? null,
      resend_yn: input.resend,
      crt_by: input.actorMemId ?? null,
    });
    if (error) console.error("[kakao] 발송 이력 기록 실패", error.message);
  } catch (e) {
    console.error("[kakao] 발송 이력 기록 실패", e);
  }
}
