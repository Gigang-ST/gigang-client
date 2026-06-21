"use server"

import { revalidatePath } from "next/cache"

import { dayjs } from "@/lib/dayjs"
import { withMember } from "@/lib/actions/auth"
import { getRequestTeamContext } from "@/lib/queries/request-team"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  createCommentSchema,
  updateCommentSchema,
  deleteCommentSchema,
  type CreateCommentInput,
  type UpdateCommentInput,
  type DeleteCommentInput,
} from "@/lib/validations/comment"

export async function createComment(input: CreateCommentInput) {
  const parsed = createCommentSchema.parse(input)
  return withMember(async ({ member, supabase }) => {
    const { teamId } = await getRequestTeamContext()
    const admin = createAdminClient()

    if (parsed.prntId) {
      const { data: parent } = await supabase.from("cmnt_mst").select("prnt_id").eq("cmnt_id", parsed.prntId).single()
      if (parent?.prnt_id) return { ok: false as const, message: "답글의 답글은 허용되지 않습니다." }
    }

    const { data: cmnt, error } = await supabase
      .from("cmnt_mst")
      .insert({
        team_id: teamId, entity_type: parsed.entityType, entity_id: parsed.entityId,
        prnt_id: parsed.prntId ?? null, mem_id: member.id, cont_txt: parsed.contTxt,
      })
      .select()
      .single()

    if (error || !cmnt) return { ok: false as const, message: "댓글 저장 실패" }

    const uniqueMentions = [...new Set(parsed.mentionedMemIds)].filter((id) => id !== member.id)

    let entityShortId: string | null = null
    if (parsed.entityType === "sch_post" && (uniqueMentions.length > 0 || !parsed.prntId)) {
      const { data: postMeta } = await admin
        .from("sch_post_mst")
        .select("sch_post_id, short_id, crt_by, sch_nm")
        .eq("sch_post_id", parsed.entityId)
        .maybeSingle()
      if (postMeta) {
        entityShortId = postMeta.short_id ?? null

        if (!parsed.prntId && postMeta.crt_by !== member.id && !uniqueMentions.includes(postMeta.crt_by)) {
          const notiRefId = parsed.entityId
          const { data: existingNoti } = await admin
            .from("noti_mst")
            .select("noti_id, noti_nm")
            .eq("mem_id", postMeta.crt_by)
            .eq("ref_id", notiRefId)
            .eq("noti_type_enm", "sch_post_cmnt")
            .eq("read_yn", false)
            .eq("del_yn", false)
            .maybeSingle()

          if (existingNoti) {
            const match = existingNoti.noti_nm.match(/새 댓글 (\d+)개/)
            // "새 댓글이 달렸습니다" (첫 번째) → count=1, "새 댓글 N개" → count=N
            const prevCount = match ? parseInt(match[1], 10) : 1
            await admin.from("noti_mst").update({
              noti_nm: `'${postMeta.sch_nm}'에 새 댓글 ${prevCount + 1}개가 달렸습니다.`,
              noti_cont: parsed.contTxt.slice(0, 100),
            }).eq("noti_id", existingNoti.noti_id)
          } else {
            await admin.from("noti_mst").insert({
              team_id: teamId, mem_id: postMeta.crt_by, noti_type_enm: "sch_post_cmnt",
              noti_nm: `'${postMeta.sch_nm}'에 새 댓글이 달렸습니다.`,
              noti_cont: parsed.contTxt.slice(0, 100),
              ref_id: notiRefId, ref_type_enm: "sch_post",
            })
          }
        }
      }
    }

    if (parsed.entityType === "gathering") {
      const { data: gthrMeta } = await admin
        .from("gthr_mst")
        .select("gthr_id, short_id, crt_by, gthr_nm")
        .eq("gthr_id", parsed.entityId)
        .maybeSingle()
      if (gthrMeta) {
        entityShortId = gthrMeta.short_id ?? null
        const notiRefId = parsed.entityId

        // 답글 알림 (gthr_reply): 부모 댓글 작성자에게 발송
        if (parsed.prntId) {
          const { data: parentCmnt } = await admin
            .from("cmnt_mst")
            .select("mem_id")
            .eq("cmnt_id", parsed.prntId)
            .maybeSingle()
          const parentAuthorId = parentCmnt?.mem_id
          if (parentAuthorId && parentAuthorId !== member.id && !uniqueMentions.includes(parentAuthorId)) {
            await admin.from("noti_mst").insert({
              team_id: teamId, mem_id: parentAuthorId, noti_type_enm: "gthr_reply",
              noti_nm: `${member.full_name}님이 모임 댓글에 답글을 달았습니다.`,
              noti_cont: parsed.contTxt.slice(0, 100),
              ref_id: notiRefId, ref_type_enm: "gathering",
            })
          }
        }

        // 개설자 댓글 알림 (gthr_cmnt): 최상위 댓글이고 개설자 본인이 아닌 경우
        if (!parsed.prntId && gthrMeta.crt_by !== member.id && !uniqueMentions.includes(gthrMeta.crt_by)) {
          const { data: existingNoti } = await admin
            .from("noti_mst")
            .select("noti_id, noti_nm")
            .eq("mem_id", gthrMeta.crt_by)
            .eq("ref_id", notiRefId)
            .eq("noti_type_enm", "gthr_cmnt")
            .eq("read_yn", false)
            .eq("del_yn", false)
            .maybeSingle()

          if (existingNoti) {
            const match = existingNoti.noti_nm.match(/새 댓글 (\d+)개/)
            // "새 댓글이 달렸습니다" (첫 번째) → count=1, "새 댓글 N개" → count=N
            const prevCount = match ? parseInt(match[1], 10) : 1
            await admin.from("noti_mst").update({
              noti_nm: `'${gthrMeta.gthr_nm}'에 새 댓글 ${prevCount + 1}개가 달렸습니다.`,
              noti_cont: parsed.contTxt.slice(0, 100),
            }).eq("noti_id", existingNoti.noti_id)
          } else {
            await admin.from("noti_mst").insert({
              team_id: teamId, mem_id: gthrMeta.crt_by, noti_type_enm: "gthr_cmnt",
              noti_nm: `'${gthrMeta.gthr_nm}'에 새 댓글이 달렸습니다.`,
              noti_cont: parsed.contTxt.slice(0, 100),
              ref_id: notiRefId, ref_type_enm: "gathering",
            })
          }
        }
      }
    }

    if (uniqueMentions.length > 0) {
      await admin.from("cmnt_mention_rel").insert(uniqueMentions.map((memId) => ({ cmnt_id: cmnt.cmnt_id, mem_id: memId })))
      if (parsed.entityType === "comp" && !entityShortId) {
        const { data: compMeta } = await admin.from("comp_mst").select("short_id").eq("comp_id", parsed.entityId).single()
        entityShortId = compMeta?.short_id ?? null
      }
      const mentionRefId = parsed.entityId
      await admin.from("noti_mst").insert(
        uniqueMentions.map((memId) => ({
          team_id: teamId, mem_id: memId, noti_type_enm: "cmnt_mention",
          noti_nm: `${member.full_name}님이 댓글에서 멘션했습니다.`,
          noti_cont: parsed.contTxt.slice(0, 100),
          ref_id: mentionRefId, ref_type_enm: parsed.entityType,
        }))
      )
    }

    revalidatePath("/")
    return { ok: true as const, data: cmnt }
  })
}

export async function updateComment(input: UpdateCommentInput) {
  const parsed = updateCommentSchema.parse(input)
  return withMember(async ({ member, supabase }) => {
    const admin = createAdminClient()

    const { count } = await supabase.from("cmnt_mst").select("cmnt_id", { count: "exact", head: true }).eq("prnt_id", parsed.cmntId).eq("del_yn", false)
    if ((count ?? 0) > 0) return { ok: false as const, message: "답글이 달린 댓글은 수정할 수 없습니다." }

    const { error, data: updated } = await supabase
      .from("cmnt_mst")
      .update({ cont_txt: parsed.contTxt, edit_yn: true, upd_at: dayjs().toISOString() })
      .eq("cmnt_id", parsed.cmntId)
      .eq("mem_id", member.id)
      .eq("del_yn", false)
      .select("cmnt_id")

    if (error || !updated?.length) return { ok: false as const, message: "댓글 수정 실패" }

    await admin.from("cmnt_mention_rel").delete().eq("cmnt_id", parsed.cmntId)
    const uniqueMentions = [...new Set(parsed.mentionedMemIds)].filter((id) => id !== member.id)
    if (uniqueMentions.length > 0) {
      await admin.from("cmnt_mention_rel").insert(uniqueMentions.map((memId) => ({ cmnt_id: parsed.cmntId, mem_id: memId })))
    }

    revalidatePath("/")
    return { ok: true as const }
  })
}

export async function deleteComment(input: DeleteCommentInput) {
  const parsed = deleteCommentSchema.parse(input)
  return withMember(async ({ member, supabase }) => {
    const { teamId } = await getRequestTeamContext()
    const admin = createAdminClient()

    if (!member.admin) {
      const { count } = await supabase.from("cmnt_mst").select("cmnt_id", { count: "exact", head: true }).eq("prnt_id", parsed.cmntId).eq("del_yn", false)
      if ((count ?? 0) > 0) return { ok: false as const, message: "답글이 달린 댓글은 삭제할 수 없습니다." }
    }

    const db = member.admin ? admin : supabase
    const query = db.from("cmnt_mst").update({ del_yn: true, upd_at: dayjs().toISOString() }).eq("cmnt_id", parsed.cmntId)
    const { error } = await (member.admin ? query.eq("team_id", teamId) : query)

    if (error) return { ok: false as const, message: "댓글 삭제 실패" }

    revalidatePath("/")
    return { ok: true as const }
  })
}
