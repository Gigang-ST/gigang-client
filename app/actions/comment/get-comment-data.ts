"use server"

import { getCurrentMember } from "@/lib/queries/member"
import { getRequestTeamContext } from "@/lib/queries/request-team"
import { createAdminClient } from "@/lib/supabase/admin"

export type CmntRowData = {
  cmnt_id: string
  prnt_id: string | null
  mem_id: string
  mem_nm: string
  avatar_url: string | null
  cont_txt: string
  edit_yn: boolean
  del_yn: boolean
  crt_at: string
  upd_at: string
}

export async function getCommentData(entityType: string, entityId: string) {
  const { member, supabase } = await getCurrentMember()
  if (!member) return { comments: [] as CmntRowData[], members: [] as { mem_id: string; mem_nm: string }[] }

  const { teamId } = await getRequestTeamContext()
  const admin = createAdminClient()

  const [{ data: cmntRows, error: cmntError }, { data: memRows }] = await Promise.all([
    supabase
      .from("cmnt_mst")
      .select("cmnt_id, prnt_id, mem_id, cont_txt, edit_yn, del_yn, crt_at, upd_at, mem_mst!cmnt_mst_mem_id_fkey(mem_nm, avatar_url)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("team_id", teamId)
      .order("crt_at", { ascending: true }),
    admin
      .from("team_mem_rel")
      .select("mem_id, mem_mst!inner(mem_nm, avatar_url)")
      .eq("team_id", teamId)
      .eq("mem_st_cd", "active")
      .eq("del_yn", false),
  ])

  if (cmntError) console.error("[getCommentData] cmnt_mst query error:", cmntError)

  const comments: CmntRowData[] = (cmntRows ?? []).map((row) => {
    const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst
    return {
      cmnt_id: row.cmnt_id,
      prnt_id: row.prnt_id,
      mem_id: row.mem_id,
      mem_nm: (mem as { mem_nm: string }).mem_nm,
      avatar_url: (mem as { avatar_url?: string | null }).avatar_url ?? null,
      cont_txt: row.cont_txt,
      edit_yn: row.edit_yn,
      del_yn: row.del_yn,
      crt_at: row.crt_at,
      upd_at: row.upd_at,
    }
  })

  const members = (memRows ?? []).map((row) => {
    const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst
    return {
      mem_id: row.mem_id,
      mem_nm: (mem as { mem_nm: string }).mem_nm,
      avatar_url: (mem as { avatar_url?: string | null }).avatar_url ?? null,
    }
  })

  return { comments, members }
}
