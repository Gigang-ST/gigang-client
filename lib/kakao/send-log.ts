/**
 * 발송 이력 기록(`kakao_send_hist`).
 *
 * **여기서 던지지 않는다.** 기록은 발송의 곁다리다 — 로그를 못 남겼다고 이미 나간 공지를
 * 되돌릴 수 없고, 기록 실패로 호출부(모임 등록 등)를 깨뜨리면 꼬리가 몸통을 흔드는 꼴이 된다.
 * 실패하면 콘솔에만 남기고 조용히 넘어간다.
 */
import "server-only";

import type { KakaoErrorJSON } from "@kakao-bot/sdk";

import { createUntypedAdminClient } from "@/lib/supabase/admin";

/** 어느 사건이 보냈는지. 이력 화면에서 출처 배지로 쓴다. */
export type KakaoSendSource = {
  type:
    | "gathering_created"
    | "gathering_updated"
    | "gathering_canceled"
    | "gathering_announce"
    | "pb_sess_open";
  id?: string | null;
};

export type RecordKakaoSendInput = {
  room: string;
  message: string;
  requestId: string | null;
  source: KakaoSendSource | null;
  resend: boolean;
  status: "success" | "failed";
  failure?: KakaoErrorJSON;
  /** 어드민에서 다시 보낸 경우 누른 사람. */
  actorMemId?: string | null;
};

export async function recordKakaoSend(input: RecordKakaoSendInput): Promise<void> {
  try {
    const supabase = createUntypedAdminClient();
    const { error } = await supabase.from("kakao_send_hist").insert({
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
