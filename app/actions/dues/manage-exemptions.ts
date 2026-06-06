"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateExemption({
  exmCfgId,
  exmTpEnm,
  exmAmt,
  aplySttDt,
  aplyEndDt,
  rsnTxt,
}: {
  exmCfgId: string;
  exmTpEnm: "full" | "part";
  exmAmt?: number;
  aplySttDt: string;
  aplyEndDt: string;
  rsnTxt: string;
}) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  if (exmTpEnm === "part" && (!exmAmt || exmAmt <= 0)) {
    return { ok: false as const, message: "부분 면제는 양수 금액을 입력해야 합니다." };
  }
  if (aplySttDt > aplyEndDt) {
    return { ok: false as const, message: "시작일이 종료일보다 늦을 수 없습니다." };
  }
  if (!rsnTxt.trim()) {
    return { ok: false as const, message: "사유를 입력해주세요." };
  }

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  if (exmTpEnm === "part" && exmAmt) {
    const { data: policy } = await db
      .from("fee_policy_cfg")
      .select("monthly_fee_amt")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .lte("aply_stt_dt", aplySttDt)
      .gte("aply_end_dt", aplySttDt)
      .order("aply_stt_dt", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (policy && exmAmt > policy.monthly_fee_amt) {
      return { ok: false as const, message: `면제 금액은 월 회비(${policy.monthly_fee_amt.toLocaleString()}원)를 초과할 수 없습니다.` };
    }
  }

  const { error } = await db
    .from("fee_due_exm_cfg")
    .update({
      exm_tp_enm: exmTpEnm,
      exm_amt: exmTpEnm === "part" ? (exmAmt ?? null) : null,
      aply_stt_dt: aplySttDt,
      aply_end_dt: aplyEndDt,
      rsn_txt: rsnTxt.trim(),
    })
    .eq("exm_cfg_id", exmCfgId)
    .eq("team_id", teamId)
    .eq("vers", 0);

  if (error) return { ok: false as const, message: "면제 수정에 실패했습니다." };
  return { ok: true as const, message: null };
}

export async function deleteExemption(exmCfgId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { error } = await db
    .from("fee_due_exm_cfg")
    .update({ del_yn: true })
    .eq("exm_cfg_id", exmCfgId)
    .eq("team_id", teamId)
    .eq("vers", 0);

  if (error) return { ok: false as const, message: "면제 삭제에 실패했습니다." };
  return { ok: true as const, message: null };
}
