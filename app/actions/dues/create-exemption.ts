"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createExemption({
  memId,
  exmTpEnm,
  exmAmt,
  aplySttDt,
  aplyEndDt,
  rsnTxt,
}: {
  memId: string;
  exmTpEnm: "full" | "part";
  exmAmt?: number;
  aplySttDt: string;
  aplyEndDt: string;
  rsnTxt: string;
}) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  if (exmTpEnm === "part" && (!exmAmt || exmAmt <= 0)) {
    return { ok: false as const, message: "부분 면제는 양수 금액을 입력해야 합니다." };
  }

  if (aplySttDt > aplyEndDt) {
    return { ok: false as const, message: "시작일이 종료일보다 늦을 수 없습니다." };
  }

  const { error } = await db.from("fee_due_exm_cfg").insert({
    team_id: teamId,
    mem_id: memId,
    exm_tp_enm: exmTpEnm,
    exm_amt: exmAmt ?? null,
    aply_stt_dt: aplySttDt,
    aply_end_dt: aplyEndDt,
    rsn_txt: rsnTxt,
    reg_by_mem_id: adminUser.id,
    vers: 0,
    del_yn: false,
  });

  if (error) return { ok: false as const, message: "면제 규칙 등록에 실패했습니다." };
  return { ok: true as const, message: null };
}
