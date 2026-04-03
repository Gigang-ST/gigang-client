"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";

export async function deleteRecord(recordId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db.from("race_result").delete().eq("id", recordId);

  if (error) return { ok: false, message: "삭제에 실패했습니다" };
  return { ok: true, message: null };
}

export async function updateRecord(
  recordId: string,
  input: {
    eventType: string;
    recordTimeSec: number;
    raceName: string;
    raceDate: string;
  },
) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db
    .from("race_result")
    .update({
      event_type: input.eventType,
      record_time_sec: input.recordTimeSec,
      race_name: input.raceName.trim(),
      race_date: input.raceDate,
    })
    .eq("id", recordId);

  if (error) return { ok: false, message: "수정에 실패했습니다" };
  return { ok: true, message: null };
}
