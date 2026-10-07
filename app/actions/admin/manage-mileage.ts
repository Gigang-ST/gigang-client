"use server";

import { withAdmin } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { PB_CLASS_TYPE } from "@/lib/pb-class";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createEvent(input: {
  evt_nm: string;
  evt_type_cd: string;
  stt_dt: string;
  end_dt: string;
  stts_enm: "READY" | "ACTIVE" | "CLOSED";
  desc_txt: string | null;
}) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data, error } = await db
      .from("evt_team_mst")
      .insert({
        team_id: teamId,
        evt_nm: input.evt_nm.trim(),
        evt_type_cd: input.evt_type_cd,
        stt_dt: input.stt_dt,
        end_dt: input.end_dt,
        stts_enm: input.stts_enm,
        desc_txt: input.desc_txt?.trim() || null,
      })
      .select("evt_id")
      .single();

    if (error) return { ok: false, message: "이벤트 생성에 실패했습니다" };
    return { ok: true, message: null, evt_id: data.evt_id };
  });
}

export async function updateEvent(
  evtId: string,
  input: {
    evt_nm: string;
    evt_type_cd: string;
    stt_dt: string;
    end_dt: string;
    stts_enm: "READY" | "ACTIVE" | "CLOSED";
    desc_txt: string | null;
  },
) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    // 참가자가 있는 프로젝트의 종류를 바꾸면 참가 행이 고아가 된다 — 마일리지 참가자는
    // evt_team_prt_rel, PB 참가자는 evt_pb_prt_rel 에 있어서 바뀐 종류의 화면이 그들을 못 본다.
    const { data: current } = await db
      .from("evt_team_mst")
      .select("evt_type_cd")
      .eq("evt_id", evtId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (!current) return { ok: false, message: "이벤트를 찾을 수 없습니다" };
    if (current.evt_type_cd !== input.evt_type_cd) {
      const [mlg, pb] = await Promise.all([
        db.from("evt_team_prt_rel").select("prt_id", { count: "exact", head: true }).eq("evt_id", evtId),
        db.from("evt_pb_prt_rel").select("prt_id", { count: "exact", head: true }).eq("evt_id", evtId),
      ]);
      if ((mlg.count ?? 0) + (pb.count ?? 0) > 0) {
        return { ok: false, message: "참가자가 있는 프로젝트는 종류를 바꿀 수 없습니다" };
      }
    }

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
      .eq("evt_id", evtId)
      .eq("team_id", teamId);
    if (error) return { ok: false, message: "이벤트 수정에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export async function deleteEvent(evtId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const { data: evt } = await db
      .from("evt_team_mst")
      .select("evt_type_cd")
      .eq("evt_id", evtId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (!evt) return { ok: false, message: "이벤트를 찾을 수 없습니다" };

    // PB 클래스 참가 행은 보증금 기록이다 — evt_pb_* 가 ON DELETE CASCADE 라 프로젝트를 지우면
    // 입금·환급 근거가 조용히 사라진다. 참가자가 있으면 지우지 말고 종료(CLOSED)로 닫게 한다.
    if (evt.evt_type_cd === PB_CLASS_TYPE) {
      const { count } = await db
        .from("evt_pb_prt_rel")
        .select("prt_id", { count: "exact", head: true })
        .eq("evt_id", evtId);
      if ((count ?? 0) > 0) {
        return {
          ok: false,
          message: "참가자가 있는 PB 클래스는 삭제할 수 없습니다. 상태를 종료로 바꿔 주세요",
        };
      }
    }

    await db.from("evt_mlg_mult_cfg").delete().eq("evt_id", evtId);
    await db.from("evt_team_prt_rel").delete().eq("evt_id", evtId);
    const { error } = await db.from("evt_team_mst").delete().eq("evt_id", evtId);
    if (error) return { ok: false, message: "이벤트 삭제에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export async function createMultiplier(input: {
  evt_id: string;
  mult_nm: string;
  mult_val: number;
  stt_dt: string | null;
  end_dt: string | null;
  active_yn: boolean;
}) {
  return withAdmin(async () => {
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
  });
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
  return withAdmin(async () => {
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
  });
}

export async function deleteMultiplier(multId: string) {
  return withAdmin(async () => {
    const db = createAdminClient();
    const { error } = await db.from("evt_mlg_mult_cfg").delete().eq("mult_id", multId);
    if (error) return { ok: false, message: "배율 삭제에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export async function approveParticipation(prtId: string) {
  return withAdmin(async () => {
    const db = createAdminClient();
    const { error } = await db
      .from("evt_team_prt_rel")
      .update({ aprv_yn: true, aprv_at: dayjs().toISOString(), updated_at: dayjs().toISOString() })
      .eq("prt_id", prtId);
    if (error) return { ok: false, message: "승인 처리에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export async function rejectParticipation(prtId: string) {
  return withAdmin(async () => {
    const db = createAdminClient();
    const { error } = await db.from("evt_team_prt_rel").delete().eq("prt_id", prtId);
    if (error) return { ok: false, message: "거부 처리에 실패했습니다" };
    return { ok: true, message: null };
  });
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
  return withAdmin(async () => {
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
  });
}

export async function revokeApproval(prtId: string) {
  return withAdmin(async () => {
    const db = createAdminClient();
    const { error } = await db
      .from("evt_team_prt_rel")
      .update({ aprv_yn: false, aprv_at: null, updated_at: dayjs().toISOString() })
      .eq("prt_id", prtId);
    if (error) return { ok: false, message: "승인 취소에 실패했습니다" };
    return { ok: true, message: null };
  });
}

export async function deleteParticipation(prtId: string) {
  return withAdmin(async () => {
    const db = createAdminClient();
    const { error } = await db.from("evt_team_prt_rel").delete().eq("prt_id", prtId);
    if (error) return { ok: false, message: "삭제에 실패했습니다" };
    return { ok: true, message: null };
  });
}
