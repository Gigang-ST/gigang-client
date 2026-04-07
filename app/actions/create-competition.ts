"use server";

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

interface CreateCompetitionInput {
  title: string;
  sport: string;
  startDate: string;
  endDate: string | null;
  location: string;
  eventTypes: string[];
  sourceUrl: string;
}

export async function createCompetition(input: CreateCompetitionInput) {
  // 1. 사용자 인증 + active 회원 확인
  const { member } = await getCurrentMember();

  if (!member || member.status !== "active") {
    return { ok: false, message: "활성 회원만 대회를 등록할 수 있습니다." };
  }

  // 3. admin 클라이언트로 대회 INSERT (RLS 우회)
  const admin = createAdminClient();
  const { data: comp, error: compErr } = await admin
    .from("comp_mst")
    .insert({
      ext_id: `manual:${crypto.randomUUID()}`,
      comp_sprt_cd: input.sport,
      comp_nm: input.title.trim(),
      stt_dt: input.startDate,
      end_dt: input.endDate || null,
      loc_nm: input.location.trim() || null,
      src_url: input.sourceUrl.trim() || null,
      vers: 0,
      del_yn: false,
    })
    .select("comp_id")
    .single();

  if (compErr || !comp) {
    console.error("대회 등록 실패(comp_mst):", compErr);
    return { ok: false, message: "등록에 실패했습니다. 다시 시도해 주세요." };
  }

  const { teamId } = await getRequestTeamContext();
  const { error: planErr } = await admin.from("team_comp_plan_rel").insert({
    team_id: teamId,
    comp_id: comp.comp_id,
    vers: 0,
    del_yn: false,
  });

  if (planErr) {
    console.error("대회 등록 실패(team_comp_plan_rel):", planErr);
    // 보상 트랜잭션: plan 생성 실패 시 방금 만든 comp_mst 정리
    await admin.from("comp_mst").delete().eq("comp_id", comp.comp_id);
    return { ok: false, message: "등록에 실패했습니다. 다시 시도해 주세요." };
  }

  if (input.eventTypes.length > 0) {
    const eventRows = input.eventTypes.map((evt) => ({
      comp_id: comp.comp_id,
      comp_evt_type: evt.trim().toUpperCase(),
      vers: 0,
      del_yn: false,
    }));
    const { error: evtErr } = await admin.from("comp_evt_cfg").insert(eventRows);
    if (evtErr) {
      console.error("대회 등록 실패(comp_evt_cfg):", evtErr);
      // 보상 트랜잭션: 이벤트 생성 실패 시 같은 팀 plan + comp_mst 정리
      await admin
        .from("team_comp_plan_rel")
        .delete()
        .eq("comp_id", comp.comp_id)
        .eq("team_id", teamId)
        .eq("vers", 0)
        .eq("del_yn", false);
      await admin.from("comp_mst").delete().eq("comp_id", comp.comp_id);
      return { ok: false, message: "등록에 실패했습니다. 다시 시도해 주세요." };
    }
  }

  revalidateTag("competitions", "max");
  return { ok: true, message: null };
}
