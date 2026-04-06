"use server";

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { GIGANG_TEAM_ID } from "@/lib/constants/gigang-team";

export async function deleteCompetition(competitionId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  const { data: plans } = await db
    .from("team_comp_plan_rel")
    .select("team_comp_id")
    .eq("comp_id", competitionId)
    .eq("team_id", GIGANG_TEAM_ID)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (plans && plans.length > 0) {
    await db
      .from("comp_reg_rel")
      .delete()
      .in("team_comp_id", plans.map((p) => p.team_comp_id));
    await db
      .from("team_comp_plan_rel")
      .delete()
      .in("team_comp_id", plans.map((p) => p.team_comp_id));
  }

  const { error } = await db
    .from("comp_mst")
    .delete()
    .eq("comp_id", competitionId);

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
    .from("comp_mst")
    .update({
      comp_nm: input.title.trim(),
      comp_sprt_cd: input.sport,
      stt_dt: input.startDate,
      end_dt: input.endDate || null,
      loc_nm: input.location.trim() || null,
      src_url: input.sourceUrl.trim() || null,
    })
    .eq("comp_id", competitionId);

  if (error) return { ok: false, message: "수정에 실패했습니다" };

  revalidateTag("competitions", "max");
  return { ok: true, message: null };
}

export async function deleteRegistration(registrationId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db
    .from("comp_reg_rel")
    .delete()
    .eq("comp_reg_id", registrationId);

  if (error) return { ok: false, message: "삭제에 실패했습니다" };
  return { ok: true, message: null };
}
