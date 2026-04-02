"use server";

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";

export async function deleteCompetition(competitionId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  // 참가 등록도 함께 삭제
  await db
    .from("competition_registration")
    .delete()
    .eq("competition_id", competitionId);

  const { error } = await db
    .from("competition")
    .delete()
    .eq("id", competitionId);

  if (error) return { ok: false, message: "삭제에 실패했습니다" };

  revalidateTag("competitions", "max");
  return { ok: true, message: null };
}

export async function updateCompetition(
  competitionId: string,
  input: {
    title: string;
    sport: string;
    startDate: string;
    endDate: string | null;
    location: string;
    eventTypes: string[];
    sourceUrl: string;
  },
) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db
    .from("competition")
    .update({
      title: input.title.trim(),
      sport: input.sport,
      start_date: input.startDate,
      end_date: input.endDate || null,
      location: input.location.trim(),
      event_types: input.eventTypes,
      source_url: input.sourceUrl.trim() || null,
    })
    .eq("id", competitionId);

  if (error) return { ok: false, message: "수정에 실패했습니다" };

  revalidateTag("competitions", "max");
  return { ok: true, message: null };
}

export async function deleteRegistration(registrationId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db
    .from("competition_registration")
    .delete()
    .eq("id", registrationId);

  if (error) return { ok: false, message: "삭제에 실패했습니다" };
  return { ok: true, message: null };
}
