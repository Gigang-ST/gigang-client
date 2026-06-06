"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function rollbackSnapshot(memIds: string[]) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };
  if (!memIds.length) return { ok: false as const, message: "대상 회원이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  let rolledBackCount = 0;

  for (const memId of memIds) {
    // 현재 vers=0 스냅샷 조회
    const { data: current } = await db
      .from("fee_mem_bal_snap")
      .select("bal_snap_id")
      .eq("team_id", teamId)
      .eq("mem_id", memId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();

    if (!current) continue;

    // 이전 버전 중 del_yn=false인 가장 최신 버전 조회
    const { data: prev } = await db
      .from("fee_mem_bal_snap")
      .select("bal_snap_id")
      .eq("team_id", teamId)
      .eq("mem_id", memId)
      .eq("del_yn", false)
      .neq("bal_snap_id", current.bal_snap_id)
      .order("vers", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 현재 vers=0 → del_yn=true (partial unique index로 vers 충돌 없음)
    const { error: delErr } = await db
      .from("fee_mem_bal_snap")
      .update({ del_yn: true })
      .eq("bal_snap_id", current.bal_snap_id);

    if (delErr) return { ok: false as const, message: `스냅샷 삭제 실패 (${memId}): ${delErr.message}` };

    // 이전 버전이 있으면 vers=0으로 복원, 없으면 스냅샷 없는 상태로 둠
    if (prev) {
      const { error: restoreErr } = await db
        .from("fee_mem_bal_snap")
        .update({ vers: 0 })
        .eq("bal_snap_id", prev.bal_snap_id);

      if (restoreErr) return { ok: false as const, message: `스냅샷 복원 실패 (${memId}): ${restoreErr.message}` };
    }

    rolledBackCount++;
  }

  return { ok: true as const, message: null, rolledBackCount };
}
