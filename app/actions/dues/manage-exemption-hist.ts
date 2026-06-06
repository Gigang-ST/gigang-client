"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function addExemptionHist({
  memId,
  aplyYm,
  exmAmt,
  rsnTxt,
}: {
  memId: string;
  aplyYm: string;
  exmAmt: number;
  rsnTxt?: string;
}) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  if (!memId) return { ok: false as const, message: "회원을 선택해주세요." };
  if (!aplyYm) return { ok: false as const, message: "적용 월을 입력해주세요." };
  if (!exmAmt || exmAmt <= 0) return { ok: false as const, message: "면제 금액을 입력해주세요." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { error } = await db.from("fee_due_exm_hist").insert({
    team_id: teamId,
    mem_id: memId,
    exm_cfg_id: null,
    aply_ym: aplyYm,
    exm_amt: exmAmt,
    grant_src_enm: "manual",
    rsn_txt: rsnTxt?.trim() || null,
    aprv_by_mem_id: adminUser.id,
    aprv_at: new Date().toISOString(),
    vers: 0,
    del_yn: false,
  });

  if (error) return { ok: false as const, message: "면제 이력 추가에 실패했습니다." };
  return { ok: true as const, message: null };
}

export async function updateExemptionHist({
  exmHistId,
  exmAmt,
  rsnTxt,
}: {
  exmHistId: string;
  exmAmt: number;
  rsnTxt?: string;
}) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  if (!exmAmt || exmAmt <= 0) return { ok: false as const, message: "면제 금액을 입력해주세요." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { error } = await db
    .from("fee_due_exm_hist")
    .update({ exm_amt: exmAmt, rsn_txt: rsnTxt?.trim() || null })
    .eq("exm_hist_id", exmHistId)
    .eq("team_id", teamId)
    .eq("vers", 0);

  if (error) return { ok: false as const, message: "면제 이력 수정에 실패했습니다." };
  return { ok: true as const, message: null };
}

export async function deleteExemptionHist(exmHistId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { error } = await db
    .from("fee_due_exm_hist")
    .update({ del_yn: true })
    .eq("exm_hist_id", exmHistId)
    .eq("team_id", teamId)
    .eq("vers", 0);

  if (error) return { ok: false as const, message: "면제 이력 삭제에 실패했습니다." };
  return { ok: true as const, message: null };
}
