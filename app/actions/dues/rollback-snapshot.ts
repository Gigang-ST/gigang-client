"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function rollbackSnapshot(memIds: string[]) {
  if (!memIds.length) return { ok: false as const, message: "대상 회원이 없습니다." };
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    let rolledBackCount = 0;

    for (const memId of memIds) {
      const { data: current } = await db.from("fee_mem_bal_snap").select("bal_snap_id, last_calc_dt").eq("team_id", teamId).eq("mem_id", memId).eq("vers", 0).eq("del_yn", false).maybeSingle();
      if (!current) continue;

      const { data: prev } = await db.from("fee_mem_bal_snap").select("bal_snap_id, last_calc_dt").eq("team_id", teamId).eq("mem_id", memId).eq("del_yn", false).neq("bal_snap_id", current.bal_snap_id).order("vers", { ascending: false }).limit(1).maybeSingle();

      const { error: delErr } = await db.from("fee_mem_bal_snap").update({ del_yn: true }).eq("bal_snap_id", current.bal_snap_id);
      if (delErr) return { ok: false as const, message: `스냅샷 삭제 실패 (${memId}): ${delErr.message}` };

      if (prev) {
        const { error: restoreErr } = await db.from("fee_mem_bal_snap").update({ vers: 0 }).eq("bal_snap_id", prev.bal_snap_id);
        if (restoreErr) return { ok: false as const, message: `스냅샷 복원 실패 (${memId}): ${restoreErr.message}` };
      }

      let fromYm: string | null = null;
      if (prev?.last_calc_dt) {
        const d = new Date(prev.last_calc_dt);
        d.setMonth(d.getMonth() + 1);
        fromYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }

      const exmQuery = db.from("fee_due_exm_hist").update({ del_yn: true }).eq("team_id", teamId).eq("mem_id", memId).eq("grant_src_enm", "rule_attd").eq("del_yn", false);
      const { error: exmErr } = fromYm ? await exmQuery.gte("aply_ym", fromYm) : await exmQuery;
      if (exmErr) return { ok: false as const, message: `면제 이력 삭제 실패 (${memId}): ${exmErr.message}` };

      rolledBackCount++;
    }

    return { ok: true as const, message: null, rolledBackCount };
  });
}
