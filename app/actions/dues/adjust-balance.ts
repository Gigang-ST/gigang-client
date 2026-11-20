"use server";

import { revalidatePath } from "next/cache";

import { dayjs } from "@/lib/dayjs";
import { withDuesAdmin } from "@/lib/actions/dues-guard";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { balanceAdjustRevertSchema, balanceAdjustSchema } from "@/lib/validations/dues-adjust";

import { recalculateBalance } from "@/app/actions/dues/recalculate-balance";

/**
 * 회원 개시잔액 조정(#704) — 엑셀 수기 시절 레거시를 사실에 맞게 바로잡는다.
 * 조정 행(금액·사유·누가·언제)을 남기고 그 회원을 재계산한다. 재계산이 조정을 개시잔액에 얹으므로
 * 몇 번 다시 돌려도 값이 유지된다. 되돌리기는 `revertBalanceAdjustment`.
 */
export async function adjustMemberBalance(memId: string, input: { adjAmt: number; reason: string }) {
  return withDuesAdmin(async ({ member }) => {
    const parsed = balanceAdjustSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false as const, message: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
    }
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: rel } = await db
      .from("team_mem_rel")
      .select("mem_id")
      .eq("team_id", teamId)
      .eq("mem_id", memId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (!rel) return { ok: false as const, message: "이 팀의 회원이 아닙니다." };

    const { error } = await db.from("fee_bal_adj_hist").insert({
      team_id: teamId,
      mem_id: memId,
      adj_amt: parsed.data.adjAmt,
      rsn_txt: parsed.data.reason,
      adj_by_mem_id: member.id,
    });
    if (error) return { ok: false as const, message: `조정 저장 실패: ${error.message}` };

    const recalc = await recalculateBalance([memId]);
    revalidatePath(`/admin/dues/members/${memId}`);
    if (!recalc.ok) {
      return { ok: false as const, message: `조정은 저장됐지만 재계산에 실패했어요: ${recalc.message}` };
    }
    return { ok: true as const, message: null };
  });
}

/** 조정 되돌리기 — 행은 지우지 않고 del_yn + 되돌린 사람·시각·사유를 남긴 뒤 재계산한다. */
export async function revertBalanceAdjustment(adjId: string, reason: string) {
  return withDuesAdmin(async ({ member }) => {
    const parsed = balanceAdjustRevertSchema.safeParse({ adjId, reason });
    if (!parsed.success) {
      return { ok: false as const, message: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
    }
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: updated, error } = await db
      .from("fee_bal_adj_hist")
      .update({
        del_yn: true,
        rvt_by_mem_id: member.id,
        rvt_at: dayjs().toISOString(),
        rvt_rsn_txt: parsed.data.reason,
      })
      .eq("adj_id", adjId)
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .select("mem_id")
      .maybeSingle();
    if (error) return { ok: false as const, message: `되돌리기 실패: ${error.message}` };
    if (!updated) return { ok: false as const, message: "이미 되돌렸거나 없는 조정이에요." };

    const recalc = await recalculateBalance([updated.mem_id]);
    revalidatePath(`/admin/dues/members/${updated.mem_id}`);
    if (!recalc.ok) {
      return { ok: false as const, message: `되돌렸지만 재계산에 실패했어요: ${recalc.message}` };
    }
    return { ok: true as const, message: null };
  });
}
