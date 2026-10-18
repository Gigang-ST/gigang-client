"use server";

import { revalidatePath } from "next/cache";

import { withAdminOrThrow } from "@/lib/actions/auth";
import { sendKakao } from "@/lib/kakao/notify";
import type { KakaoSendSource } from "@/lib/kakao/send-log";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

/** 한 번에 보여줄 행 수. 목록은 "최근에 뭐가 나갔나"를 훑는 자리라 깊이 들어갈 일이 없다. */
const PAGE_SIZE = 100;

export type KakaoSendLogRow = {
  sendId: string;
  room: string;
  message: string;
  requestId: string | null;
  status: "success" | "failed";
  errName: string | null;
  errMsg: string | null;
  httpStatus: number | null;
  errCode: string | null;
  retryable: boolean;
  srcType: KakaoSendSource["type"] | null;
  srcId: string | null;
  resend: boolean;
  createdAt: string;
};

type Raw = {
  send_id: string;
  room_nm: string;
  msg_txt: string;
  request_id: string | null;
  status: "success" | "failed";
  err_name: string | null;
  err_msg: string | null;
  http_status: number | null;
  err_code: string | null;
  retryable: boolean;
  src_type: KakaoSendSource["type"] | null;
  src_id: string | null;
  resend_yn: boolean;
  crt_at: string;
};

const toRow = (r: Raw): KakaoSendLogRow => ({
  sendId: r.send_id,
  room: r.room_nm,
  message: r.msg_txt,
  requestId: r.request_id,
  status: r.status,
  errName: r.err_name,
  errMsg: r.err_msg,
  httpStatus: r.http_status,
  errCode: r.err_code,
  retryable: r.retryable,
  srcType: r.src_type,
  srcId: r.src_id,
  resend: r.resend_yn,
  createdAt: r.crt_at,
});

export type KakaoSendLogs = {
  logs: KakaoSendLogRow[];
  /**
   * 이 환경 DB 에 `kakao_send_hist` 가 아직 없다(마이그레이션 미적용). 발송은 그대로 되고
   * 기록만 안 남는 상태라, 화면을 에러로 막지 않고 안내만 띄운다.
   */
  tableMissing: boolean;
};

/** PostgREST "스키마 캐시에 테이블 없음" · Postgres undefined_table. */
const isMissingTable = (error: { code?: string }) =>
  error.code === "PGRST205" || error.code === "42P01";

/** 발송 이력 최신순. */
export async function getKakaoSendLogs(): Promise<KakaoSendLogs> {
  return withAdminOrThrow(async () => {
    const admin = createUntypedAdminClient();
    const { data, error } = await admin
      .from("kakao_send_hist")
      .select("*")
      .order("crt_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      if (isMissingTable(error)) return { logs: [], tableMissing: true };
      throw new Error(`발송 이력을 불러오지 못했어요: ${error.message}`);
    }
    return { logs: ((data ?? []) as Raw[]).map(toRow), tableMissing: false };
  });
}

export type ResendResult = { ok: boolean; message: string };

/**
 * 실패한 건을 다시 보낸다.
 *
 * **저장된 본문을 그대로** 보낸다 — 원본 모임을 다시 조회해 문구를 재조립하면, 그 사이 모임이
 * 바뀌거나 지워졌을 때 보내려던 것과 다른 글이 나간다. 화면이 전문을 먼저 보여주고 사람이 판단한다.
 *
 * **`request_id` 도 그대로 재사용한다.** 새 값으로 보내면 허브의 중복 차단이 풀려, 사실은 접수됐던
 * 건이 한 번 더 나간다.
 */
export async function resendKakao(sendId: string): Promise<ResendResult> {
  return withAdminOrThrow(async ({ member }) => {
    const admin = createUntypedAdminClient();
    const { data, error } = await admin
      .from("kakao_send_hist")
      .select("*")
      .eq("send_id", sendId)
      .single();
    if (error || !data) throw new Error("발송 이력을 찾을 수 없어요.");

    const row = data as Raw;
    // 버튼을 감추는 건 안내일 뿐이다 — send_id 만 알면 액션은 직접 불린다. 서버가 다시 판정한다.
    if (row.status === "success") throw new Error("이미 보낸 건이에요.");
    if (!row.retryable) {
      throw new Error("이 실패는 다시 보내도 같은 결과예요. 원인을 먼저 확인해 주세요.");
    }

    const result = await sendKakao(row.msg_txt, {
      room: row.room_nm,
      ...(row.request_id ? { requestId: row.request_id } : {}),
      ...(row.src_type ? { source: { type: row.src_type, id: row.src_id } } : {}),
      resend: true,
      actorMemId: member.id,
    });

    revalidatePath("/admin/kakao");

    if (result.ok) return { ok: true, message: "다시 보냈어요." };
    if (result.skipped === "disabled") {
      return { ok: false, message: "이 환경엔 노티봇이 연결돼 있지 않아요." };
    }
    return { ok: false, message: result.failure?.message ?? "다시 보내지 못했어요." };
  });
}
