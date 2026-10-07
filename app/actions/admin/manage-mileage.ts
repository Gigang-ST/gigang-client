"use server";

import { revalidatePath } from "next/cache";

import { withAdmin } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { PB_CLASS_DEFAULT_CFG, PB_CLASS_TYPE, pbEndDtFor } from "@/lib/pb-class";
import { cfgFromRow } from "@/lib/queries/pb-class";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { pbEvtIdSchema } from "@/lib/validations/pb-class";

/** 프로젝트 상태 — evt_stts_enm */
const EVENT_STATUSES = ["READY", "ACTIVE", "CLOSED"] as const;

/** `YYYY-MM-DD` 모양인가 — PB 종료일 계산이 날짜 문자열을 그대로 파싱해서, 깨진 값이 DB 까지 가기 전에 막는다 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** 이 프로젝트에 참가자가 몇 명 있는가 — 마일리지(evt_team_prt_rel)와 PB(evt_pb_prt_rel) 둘 다 센다 */
async function countEventParticipants(
  db: ReturnType<typeof createAdminClient>,
  evtId: string,
): Promise<{ ok: true; count: number } | { ok: false }> {
  const [mlg, pb] = await Promise.all([
    db.from("evt_team_prt_rel").select("prt_id", { count: "exact", head: true }).eq("evt_id", evtId),
    db.from("evt_pb_prt_rel").select("prt_id", { count: "exact", head: true }).eq("evt_id", evtId),
  ]);
  // 조회가 실패하면 0명으로 눙치지 않는다 — 이 숫자가 「삭제해도 되나」를 정하므로 실패는 막는 쪽으로 읽는다
  if (mlg.error || pb.error) return { ok: false };
  return { ok: true, count: (mlg.count ?? 0) + (pb.count ?? 0) };
}

const PARTICIPANTS_BLOCK_DELETE = "참가자가 있는 프로젝트는 삭제할 수 없어요. 종료하면 지난 프로젝트로 보관돼요";

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

    // PB 클래스의 종료일은 클라이언트가 정하지 않는다 — 시작일과 총 회차에서 서버가 계산한다.
    // 손으로 넣게 두면 W12 날짜로 끊어 측정 벙(W13~14) 연결이 막히는 일이 실제로 있었다.
    // 새 프로젝트는 설정 행이 아직 없으므로 기본 회차(13)로 센다 — 저장된 설정이 있으면 `savePbCfg`가 다시 계산한다.
    let endDt = input.end_dt;
    if (input.evt_type_cd === PB_CLASS_TYPE) {
      if (!DATE_ONLY.test(input.stt_dt)) return { ok: false, message: "시작일 형식이 올바르지 않습니다" };
      endDt = pbEndDtFor(input.stt_dt, PB_CLASS_DEFAULT_CFG);
    }

    const { data, error } = await db
      .from("evt_team_mst")
      .insert({
        team_id: teamId,
        evt_nm: input.evt_nm.trim(),
        evt_type_cd: input.evt_type_cd,
        stt_dt: input.stt_dt,
        end_dt: endDt,
        stts_enm: input.stts_enm,
        desc_txt: input.desc_txt?.trim() || null,
      })
      .select("evt_id")
      .single();

    if (error) return { ok: false, message: "이벤트 생성에 실패했습니다" };
    revalidatePath("/projects");
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
      const prts = await countEventParticipants(db, evtId);
      if (!prts.ok) return { ok: false, message: "이벤트 수정에 실패했습니다" };
      if (prts.count > 0) {
        return { ok: false, message: "참가자가 있는 프로젝트는 종류를 바꿀 수 없습니다" };
      }
    }

    // PB 클래스의 종료일은 서버가 계산한다(createEvent 와 같은 이유). 회차 수는 저장된 설정을 따른다 —
    // 총 회차를 고쳐 둔 프로젝트의 시작일을 옮길 때 기본값(13)으로 세면 종료일이 어긋난다.
    let endDt = input.end_dt;
    if (input.evt_type_cd === PB_CLASS_TYPE) {
      if (!DATE_ONLY.test(input.stt_dt)) return { ok: false, message: "시작일 형식이 올바르지 않습니다" };
      const { data: cfgRow, error: cfgError } = await db
        .from("evt_pb_cfg")
        .select("*")
        .eq("evt_id", evtId)
        .maybeSingle();
      if (cfgError) return { ok: false, message: "이벤트 수정에 실패했습니다" };
      endDt = pbEndDtFor(input.stt_dt, cfgFromRow(cfgRow));
    }

    const { error } = await db
      .from("evt_team_mst")
      .update({
        evt_nm: input.evt_nm.trim(),
        evt_type_cd: input.evt_type_cd,
        stt_dt: input.stt_dt,
        end_dt: endDt,
        stts_enm: input.stts_enm,
        desc_txt: input.desc_txt?.trim() || null,
        updated_at: dayjs().toISOString(),
      })
      .eq("evt_id", evtId)
      .eq("team_id", teamId);
    if (error) return { ok: false, message: "이벤트 수정에 실패했습니다" };
    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

/**
 * 프로젝트 상태만 바꾼다 — 「종료(CLOSED)로 보관」이 삭제를 대신하는 길이다.
 *
 * 이름·기간을 담은 `updateEvent`와 갈라 둔 이유: 상태 하나를 바꾸려고 폼 전체를 다시 보내면
 * PB 의 종료일 재계산·종류 변경 검사까지 줄줄이 타고, 목록의 「종료」 버튼이 폼 값에 의존하게 된다.
 * 팀을 where 에 걸고 갱신 행 수를 확인한다 — 다른 팀 프로젝트가 id 추측만으로 닫히지 않게.
 */
export async function setEventStatus(
  evtId: string,
  status: "READY" | "ACTIVE" | "CLOSED",
): Promise<{ ok: boolean; message: string | null }> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: "프로젝트 정보가 올바르지 않습니다" };
  // 서버 액션 인자는 타입이 아니라 런타임 값이다 — enum 밖의 값은 DB 가 아니라 여기서 막는다
  if (!(EVENT_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: "프로젝트 상태가 올바르지 않습니다" };
  }

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data, error } = await db
      .from("evt_team_mst")
      .update({ stts_enm: status, updated_at: dayjs().toISOString() })
      .eq("evt_id", parsedEvt.data)
      .eq("team_id", teamId)
      .select("evt_id");
    if (error) return { ok: false, message: "상태 변경에 실패했습니다" };
    if (!data || data.length === 0) return { ok: false, message: "이벤트를 찾을 수 없습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

/**
 * 프로젝트 참가자 수(마일리지 + PB) — 관리자 화면이 「삭제」 링크를 보일지 정하는 데 쓴다.
 * 삭제 가능 여부의 최종 판정은 `deleteEvent`가 서버에서 다시 한다(이 숫자는 화면 안내일 뿐).
 */
export async function getEventParticipantCount(
  evtId: string,
): Promise<{ ok: true; message: null; count: number } | { ok: false; message: string }> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: "프로젝트 정보가 올바르지 않습니다" };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    // 다른 팀 프로젝트의 참가자 수를 id 추측으로 못 읽게 팀을 먼저 확인한다
    const { data: evt } = await db
      .from("evt_team_mst")
      .select("evt_id")
      .eq("evt_id", parsedEvt.data)
      .eq("team_id", teamId)
      .maybeSingle();
    if (!evt) return { ok: false as const, message: "이벤트를 찾을 수 없습니다" };

    const prts = await countEventParticipants(db, parsedEvt.data);
    if (!prts.ok) return { ok: false as const, message: "참가자 수를 불러오지 못했습니다" };
    return { ok: true as const, message: null, count: prts.count };
  });
}

export async function deleteEvent(evtId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    const { data: evt } = await db
      .from("evt_team_mst")
      .select("evt_id")
      .eq("evt_id", evtId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (!evt) return { ok: false, message: "이벤트를 찾을 수 없습니다" };

    // 참가자(마일리지·PB 모두)가 있으면 지우지 않는다. 마일리지는 이 아래에서 참가 행과 활동 기록까지
    // 통째로 지워 버리고, PB 는 evt_pb_* 가 ON DELETE CASCADE 라 입금·환급 근거가 조용히 사라진다 —
    // 둘 다 되돌릴 수 없다. 끝난 프로젝트는 지우지 말고 종료(CLOSED)로 보관한다(`setEventStatus`).
    const prts = await countEventParticipants(db, evtId);
    if (!prts.ok) return { ok: false, message: "이벤트 삭제에 실패했습니다" };
    if (prts.count > 0) return { ok: false, message: PARTICIPANTS_BLOCK_DELETE };

    await db.from("evt_mlg_mult_cfg").delete().eq("evt_id", evtId);
    const { error } = await db.from("evt_team_mst").delete().eq("evt_id", evtId).eq("team_id", teamId);
    if (error) return { ok: false, message: "이벤트 삭제에 실패했습니다" };
    revalidatePath("/projects");
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
