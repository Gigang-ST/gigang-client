"use server";

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";

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
  const adminUser = await verifyAdmin();
  if (!adminUser) {
    return { ok: false, message: "권한이 없습니다" };
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

  // team_comp_plan_rel은 멤버가 참가 신청할 때만 생성한다 (카탈로그만 등록).

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
      await admin.from("comp_mst").delete().eq("comp_id", comp.comp_id);
      return { ok: false, message: "등록에 실패했습니다. 다시 시도해 주세요." };
    }
  }

  revalidateTag("competitions", "max");
  return { ok: true, message: null };
}
