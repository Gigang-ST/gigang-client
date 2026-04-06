"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";

export async function deleteRecord(recordId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db.from("rec_race_hist").delete().eq("race_result_id", recordId);

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
    .from("rec_race_hist")
    .update({
      rec_time_sec: input.recordTimeSec,
      race_nm: input.raceName.trim(),
      race_dt: input.raceDate,
    })
    .eq("race_result_id", recordId);

  if (error) return { ok: false, message: "수정에 실패했습니다" };
  return { ok: true, message: null };
}
