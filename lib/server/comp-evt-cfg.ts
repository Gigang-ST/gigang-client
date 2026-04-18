import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminClient = SupabaseClient<Database>;

export function normalizeCompEvtType(eventType: string) {
  return eventType.trim().toUpperCase();
}

/** 대회·종목 타입이 일치하는 comp_evt_cfg 행을 찾거나(소프트삭제면 복구) 신규 삽입한다. */
export async function resolveOrCreateCompEvtId(
  admin: AdminClient,
  compId: string,
  eventTypeUpper: string,
): Promise<{ ok: true; compEvtId: string } | { ok: false; message: string }> {
  const { data: compRow, error: compErr } = await admin
    .from("comp_mst")
    .select("comp_id")
    .eq("comp_id", compId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (compErr || !compRow) {
    return { ok: false, message: "대회 정보를 찾을 수 없습니다." };
  }

  const { data: existingRows, error: findErr } = await admin
    .from("comp_evt_cfg")
    .select("comp_evt_id, del_yn")
    .eq("comp_id", compId)
    .eq("vers", 0)
    .eq("comp_evt_type", eventTypeUpper)
    .limit(1);

  if (findErr) {
    return { ok: false, message: "종목 정보를 확인하지 못했습니다." };
  }

  const existing = existingRows?.[0];
  if (existing) {
    if (existing.del_yn) {
      const { error: reviveErr } = await admin
        .from("comp_evt_cfg")
        .update({ del_yn: false })
        .eq("comp_evt_id", existing.comp_evt_id);
      if (reviveErr) {
        return { ok: false, message: "종목 설정을 복구하지 못했습니다." };
      }
    }
    return { ok: true, compEvtId: existing.comp_evt_id };
  }

  const { data: inserted, error: insErr } = await admin
    .from("comp_evt_cfg")
    .insert({
      comp_id: compId,
      comp_evt_type: eventTypeUpper,
      vers: 0,
      del_yn: false,
    })
    .select("comp_evt_id")
    .single();

  if (insErr?.code === "23505") {
    const { data: again } = await admin
      .from("comp_evt_cfg")
      .select("comp_evt_id, del_yn")
      .eq("comp_id", compId)
      .eq("vers", 0)
      .eq("comp_evt_type", eventTypeUpper)
      .limit(1);
    const row = again?.[0];
    if (row) {
      if (row.del_yn) {
        await admin.from("comp_evt_cfg").update({ del_yn: false }).eq("comp_evt_id", row.comp_evt_id);
      }
      return { ok: true, compEvtId: row.comp_evt_id };
    }
  }

  if (insErr || !inserted) {
    return { ok: false, message: "종목을 등록하지 못했습니다. 다시 시도해 주세요." };
  }

  return { ok: true, compEvtId: inserted.comp_evt_id };
}

/** 참가 신청에 연결된 comp_evt_id가 있으면 검증 후 사용한다. */
export async function resolveCompEvtIdForRaceRecord(
  admin: AdminClient,
  compId: string,
  eventTypeUpper: string,
  registrationCompEvtId: string | null | undefined,
): Promise<{ ok: true; compEvtId: string } | { ok: false; message: string }> {
  const regId = registrationCompEvtId?.trim();
  if (regId) {
    const { data: regEvt, error: regErr } = await admin
      .from("comp_evt_cfg")
      .select("comp_evt_id, comp_id, comp_evt_type, del_yn, vers")
      .eq("comp_evt_id", regId)
      .maybeSingle();

    if (regErr || !regEvt || regEvt.comp_id !== compId || regEvt.vers !== 0 || regEvt.del_yn) {
      return { ok: false, message: "참가 종목 정보가 올바르지 않습니다. 대회를 다시 선택해 주세요." };
    }
    if (normalizeCompEvtType(regEvt.comp_evt_type) !== eventTypeUpper) {
      return {
        ok: false,
        message: "참가 종목과 기록 종목이 일치하지 않습니다. 대회를 다시 선택해 주세요.",
      };
    }
    return { ok: true, compEvtId: regEvt.comp_evt_id };
  }

  return resolveOrCreateCompEvtId(admin, compId, eventTypeUpper);
}
