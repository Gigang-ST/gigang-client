"use server";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function revokeTitle(memTtlId: string) {
  return withAdmin(async () => {
    // 접속한 팀의 보유 칭호만 — service_role 이라 RLS 가 없어 id 만으로 찾으면 다른 팀 것도 회수된다.
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: row } = await db
      .from("mem_ttl_rel")
      .select("vers")
      .eq("mem_ttl_id", memTtlId)
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .maybeSingle();

    if (!row) return { ok: false as const, message: "보유 칭호를 찾을 수 없습니다." };

    const { data: updated, error } = await db
      .from("mem_ttl_rel")
      .update({ del_yn: true, vers: row.vers + 1 })
      .eq("mem_ttl_id", memTtlId)
      .eq("team_id", teamId)
      .eq("vers", row.vers)
      .eq("del_yn", false)
      .select("mem_ttl_id");

    if (error) {
      console.error("[revokeTitle] UPDATE 실패:", error);
      return { ok: false as const, message: "회수에 실패했습니다." };
    }
    if (!updated || updated.length === 0) return { ok: false as const, message: "이미 회수되었거나 상태가 변경된 칭호입니다." };
    return { ok: true as const, message: null };
  });
}
