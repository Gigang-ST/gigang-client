"use server";

import dayjs from "dayjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

// ─────────────────────────────────────────
// 이벤트(evt_team_mst) CRUD
// ─────────────────────────────────────────

export async function createEvent(input: {
  evt_nm: string;
  evt_type_cd: string;
  stt_dt: string;
  end_dt: string;
  stts_enm: string;
  desc_txt: string | null;
}) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { error } = await db.from("evt_team_mst").insert({
    team_id: teamId,
    evt_nm: input.evt_nm.trim(),
    evt_type_cd: input.evt_type_cd,
    stt_dt: input.stt_dt,
    end_dt: input.end_dt,
    stts_enm: input.stts_enm,
    desc_txt: input.desc_txt?.trim() || null,
  });

  if (error) return { ok: false, message: "이벤트 생성에 실패했습니다" };
  return { ok: true, message: null };
}

export async function updateEvent(
  evtId: string,
  input: {
    evt_nm: string;
    evt_type_cd: string;
    stt_dt: string;
    end_dt: string;
    stts_enm: string;
    desc_txt: string | null;
  },
) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  const { error } = await db
    .from("evt_team_mst")
    .update({
      evt_nm: input.evt_nm.trim(),
      evt_type_cd: input.evt_type_cd,
      stt_dt: input.stt_dt,
      end_dt: input.end_dt,
      stts_enm: input.stts_enm,
      desc_txt: input.desc_txt?.trim() || null,
      updated_at: dayjs().toISOString(),
    })
    .eq("evt_id", evtId);

  if (error) return { ok: false, message: "이벤트 수정에 실패했습니다" };
  return { ok: true, message: null };
}

export async function deleteEvent(evtId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  // 연관 데이터 순서대로 삭제
  await db.from("evt_mlg_act_hist").delete().eq("evt_id", evtId);
  await db.from("evt_mlg_goal_cfg").delete().eq("evt_id", evtId);
  await db.from("evt_mlg_mult_cfg").delete().eq("evt_id", evtId);
  await db.from("evt_team_prt_rel").delete().eq("evt_id", evtId);

  const { error } = await db.from("evt_team_mst").delete().eq("evt_id", evtId);

  if (error) return { ok: false, message: "이벤트 삭제에 실패했습니다" };
  return { ok: true, message: null };
}

// ─────────────────────────────────────────
// 배율(evt_mlg_mult_cfg) CRUD
// ─────────────────────────────────────────

export async function createMultiplier(input: {
  evt_id: string;
  mult_nm: string;
  mult_val: number;
  stt_dt: string | null;
  end_dt: string | null;
  active_yn: boolean;
}) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  const { error } = await db.from("evt_mlg_mult_cfg").insert({
    evt_id: input.evt_id,
    mult_nm: input.mult_nm.trim(),
    mult_val: input.mult_val,
    stt_dt: input.stt_dt || null,
    end_dt: input.end_dt || null,
    active_yn: input.active_yn,
  });

  if (error) return { ok: false, message: "배율 생성에 실패했습니다" };
  return { ok: true, message: null };
}

export async function updateMultiplier(
  multId: string,
  input: {
    mult_nm: string;
    mult_val: number;
    stt_dt: string | null;
    end_dt: string | null;
    active_yn: boolean;
  },
) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  const { error } = await db
    .from("evt_mlg_mult_cfg")
    .update({
      mult_nm: input.mult_nm.trim(),
      mult_val: input.mult_val,
      stt_dt: input.stt_dt || null,
      end_dt: input.end_dt || null,
      active_yn: input.active_yn,
      updated_at: dayjs().toISOString(),
    })
    .eq("mult_id", multId);

  if (error) return { ok: false, message: "배율 수정에 실패했습니다" };
  return { ok: true, message: null };
}

export async function deleteMultiplier(multId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  const { error } = await db
    .from("evt_mlg_mult_cfg")
    .delete()
    .eq("mult_id", multId);

  if (error) return { ok: false, message: "배율 삭제에 실패했습니다" };
  return { ok: true, message: null };
}

// ─────────────────────────────────────────
// 참여자 승인(evt_team_prt_rel)
// ─────────────────────────────────────────

export async function approveParticipation(prtId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  const { error } = await db
    .from("evt_team_prt_rel")
    .update({
      aprv_yn: true,
      aprv_at: dayjs().toISOString(),
      updated_at: dayjs().toISOString(),
    })
    .eq("prt_id", prtId);

  if (error) return { ok: false, message: "승인 처리에 실패했습니다" };
  return { ok: true, message: null };
}

export async function rejectParticipation(prtId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  // 연관 목표 삭제
  const { data: prt } = await db
    .from("evt_team_prt_rel")
    .select("evt_id, mem_id")
    .eq("prt_id", prtId)
    .single();

  if (prt) {
    await db
      .from("evt_mlg_goal_cfg")
      .delete()
      .eq("prt_id", prtId);
  }

  const { error } = await db
    .from("evt_team_prt_rel")
    .delete()
    .eq("prt_id", prtId);

  if (error) return { ok: false, message: "거부 처리에 실패했습니다" };
  return { ok: true, message: null };
}

export async function updateParticipation(
  prtId: string,
  input: {
    stt_mth: string;
    init_goal: number;
    deposit_amt: number;
    entry_fee_amt: number;
    singlet_fee_amt: number;
    has_singlet_yn: boolean;
  },
) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  const { error } = await db
    .from("evt_team_prt_rel")
    .update({
      stt_mth: input.stt_mth,
      init_goal: input.init_goal,
      deposit_amt: input.deposit_amt,
      entry_fee_amt: input.entry_fee_amt,
      singlet_fee_amt: input.singlet_fee_amt,
      has_singlet_yn: input.has_singlet_yn,
      updated_at: dayjs().toISOString(),
    })
    .eq("prt_id", prtId);

  if (error) return { ok: false, message: "수정에 실패했습니다" };
  return { ok: true, message: null };
}

export async function revokeApproval(prtId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  const { error } = await db
    .from("evt_team_prt_rel")
    .update({
      aprv_yn: false,
      aprv_at: null,
      updated_at: dayjs().toISOString(),
    })
    .eq("prt_id", prtId);

  if (error) return { ok: false, message: "승인 취소에 실패했습니다" };
  return { ok: true, message: null };
}

export async function deleteParticipation(prtId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();

  const { data: prt } = await db
    .from("evt_team_prt_rel")
    .select("evt_id, mem_id")
    .eq("prt_id", prtId)
    .single();

  if (prt) {
    await db.from("evt_mlg_act_hist").delete().eq("prt_id", prtId);
    await db.from("evt_mlg_goal_cfg").delete().eq("prt_id", prtId);
  }

  const { error } = await db.from("evt_team_prt_rel").delete().eq("prt_id", prtId);

  if (error) return { ok: false, message: "삭제에 실패했습니다" };
  return { ok: true, message: null };
}
