"use server";

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export async function deleteCompetition(competitionId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data: plans } = await db
    .from("team_comp_plan_rel")
    .select("team_comp_id")
    .eq("comp_id", competitionId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (plans && plans.length > 0) {
    const { error: regErr } = await db
      .from("comp_reg_rel")
      .delete()
      .in("team_comp_id", plans.map((p) => p.team_comp_id));
    if (regErr) return { ok: false, message: "삭제에 실패했습니다" };

    const { error: planErr } = await db
      .from("team_comp_plan_rel")
      .delete()
      .in("team_comp_id", plans.map((p) => p.team_comp_id));
    if (planErr) return { ok: false, message: "삭제에 실패했습니다" };
  }

  // 다른 팀의 plan이 남아있으면 comp_mst(전역 마스터)는 지우지 않는다.
  const { data: remainingPlans, error: remainErr } = await db
    .from("team_comp_plan_rel")
    .select("team_comp_id")
    .eq("comp_id", competitionId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .limit(1);
  if (remainErr) return { ok: false, message: "삭제에 실패했습니다" };

  if (!remainingPlans || remainingPlans.length === 0) {
    const { error } = await db
      .from("comp_mst")
      .delete()
      .eq("comp_id", competitionId);

    if (error) return { ok: false, message: "삭제에 실패했습니다" };
  }

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
  const { error: compErr } = await db
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

  if (compErr) return { ok: false, message: "수정에 실패했습니다" };

  // 세부종목(eventTypes)은 comp_evt_cfg에 저장한다.
  const { error: delErr } = await db
    .from("comp_evt_cfg")
    .delete()
    .eq("comp_id", competitionId)
    .eq("vers", 0)
    .eq("del_yn", false);
  if (delErr) return { ok: false, message: "수정에 실패했습니다" };

  const nextTypes = (input.eventTypes ?? [])
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);

  if (nextTypes.length > 0) {
    const { error: insErr } = await db.from("comp_evt_cfg").insert(
      nextTypes.map((t) => ({
        comp_id: competitionId,
        comp_evt_type: t,
        vers: 0,
        del_yn: false,
      })),
    );
    if (insErr) return { ok: false, message: "수정에 실패했습니다" };
  }

  revalidateTag("competitions", "max");
  return { ok: true, message: null };
}

export async function deleteRegistration(registrationId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db
    .from("comp_reg_rel")
    .delete()
    .eq("comp_reg_id", registrationId);

  if (error) return { ok: false, message: "삭제에 실패했습니다" };
  revalidateTag("competitions", "max");
  return { ok: true, message: null };
}
