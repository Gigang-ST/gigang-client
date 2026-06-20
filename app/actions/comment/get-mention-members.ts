"use server"

import { withMember } from "@/lib/actions/auth"
import { getRequestTeamContext } from "@/lib/queries/request-team"
import { createAdminClient } from "@/lib/supabase/admin"

import type { MemberOption } from "@/components/comment/mention-input"

export async function getMentionMembers(): Promise<MemberOption[]> {
  return withMember(async () => {
    const { teamId } = await getRequestTeamContext()
    const admin = createAdminClient()

    const { data: memRows, error } = await admin
      .from("team_mem_rel")
      .select("mem_id, mem_mst!inner(mem_nm, avatar_url)")
      .eq("team_id", teamId)
      .eq("mem_st_cd", "active")
      .eq("del_yn", false)

    if (error) {
      console.error("[getMentionMembers] team_mem_rel 조회 실패:", error)
      return []
    }

    return (memRows ?? []).flatMap((row) => {
      const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst
      if (!mem || !(mem as { mem_nm?: string | null }).mem_nm) return []
      return [{
        mem_id: row.mem_id,
        mem_nm: (mem as { mem_nm: string }).mem_nm,
        avatar_url: (mem as { avatar_url?: string | null }).avatar_url ?? null,
      }]
    })
  })
}
