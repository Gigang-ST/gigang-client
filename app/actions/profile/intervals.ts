"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withActive, withMember } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import {
  MANUAL_REFRESH_MIN_MINUTES,
  connectIntervalsCore,
  disconnectIntervalsCore,
  getIntervalsStatus,
  syncIntervalsForMember,
} from "@/lib/intervals/core";
import { getIntervalsSecret } from "@/lib/intervals/server";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

/**
 * intervals.icu 연결·새로고침·해제(#760) — 본인 것만(세션의 member.id).
 *
 * ⚠️ API 키는 이 액션 안에서만 평문이다 — 응답·로그·에러에 싣지 않는다.
 * 연결하면 「운영진은 요약만 본다」는 열람 범위에 동의한 것으로 본다(연결 화면에 문구를 명시한다).
 */

type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

// intervals.icu 개인 키는 영숫자(약 25자)다. 공백·줄바꿈이 섞인 붙여넣기는 trim 후에도 남으면 거부한다.
const apiKeySchema = z
  .string()
  .trim()
  .min(8, "API 키를 입력해 주세요.")
  .max(200, "API 키가 너무 길어요.")
  .regex(/^\S+$/, "API 키에 공백이 들어 있어요.");

const NOT_READY = "아직 intervals.icu 연결을 쓸 수 없어요. 운영진에게 알려 주세요.";

export async function connectIntervals(apiKey: string): Promise<ActionResult> {
  const parsed = apiKeySchema.safeParse(apiKey);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "API 키를 확인해 주세요." };
  const secret = getIntervalsSecret();
  if (!secret) return { ok: false, message: NOT_READY };

  return withActive(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const res = await connectIntervalsCore(createUntypedAdminClient(), {
      memId: member.id,
      teamId,
      apiKey: parsed.data,
      secret,
    });
    if (!res.ok) return res;
    revalidatePath("/profile");
    return { ok: true as const, message: `연결했어요. 활동 ${res.added}건을 가져왔어요.` };
  });
}

export async function refreshIntervals(): Promise<ActionResult> {
  const secret = getIntervalsSecret();
  if (!secret) return { ok: false, message: NOT_READY };

  return withActive(async ({ member }) => {
    const db = createUntypedAdminClient();
    const status = await getIntervalsStatus(db, member.id);
    if (!status.connected) return { ok: false as const, message: "연결된 intervals.icu 가 없어요." };
    if (status.lastSyncAt && dayjs().diff(dayjs(status.lastSyncAt), "minute") < MANUAL_REFRESH_MIN_MINUTES) {
      return { ok: false as const, message: `방금 가져왔어요. ${MANUAL_REFRESH_MIN_MINUTES}분 뒤에 다시 눌러 주세요.` };
    }
    const res = await syncIntervalsForMember(db, { memId: member.id, secret });
    revalidatePath("/profile");
    if (!res.ok) return { ok: false as const, message: res.message };
    return { ok: true as const, message: res.added > 0 ? `새 활동 ${res.added}건을 가져왔어요.` : "새 활동이 없어요." };
  });
}

export async function disconnectIntervals(): Promise<ActionResult> {
  // 해제는 비활성 회원도 할 수 있어야 한다(내 데이터를 지우는 길) — withMember(탈퇴만 차단)
  return withMember(async ({ member }) => {
    const res = await disconnectIntervalsCore(createUntypedAdminClient(), member.id);
    if (!res.ok) return { ok: false as const, message: "연결을 해제하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
    revalidatePath("/profile");
    return { ok: true as const, message: "연결을 해제하고 가져온 기록을 지웠어요." };
  });
}
