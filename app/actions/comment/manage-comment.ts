"use server"

import { after } from "next/server"

import { dayjs } from "@/lib/dayjs"
import { withMember } from "@/lib/actions/auth"
import { insertNoti, insertNotiMany } from "@/lib/notifications/insert-noti"
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

    // 멘션 관계는 댓글 기능의 일부라 응답 전에 저장(렌더링에 필요).
    if (uniqueMentions.length > 0) {
      await admin.from("cmnt_mention_rel").insert(uniqueMentions.map((memId) => ({ cmnt_id: cmnt.cmnt_id, mem_id: memId })))
    }

    // 알림 발송(인앱+푸시)은 전부 응답 후 백그라운드로 — 댓글 작성 속도는 푸시 유무와 무관하게 동일.
    // 알림에 필요한 메타 조회도 after 안에서 해 응답 경로를 가볍게 한다.
    const commenterName = member.full_name
    const preview = parsed.contTxt.slice(0, 100)
    after(async () => {
      try {
        if (parsed.entityType === "sch_post" && !parsed.prntId) {
          const { data: postMeta } = await admin
            .from("sch_post_mst")
            .select("crt_by, sch_nm")
            .eq("sch_post_id", parsed.entityId)
            .maybeSingle()
          if (postMeta && postMeta.crt_by !== member.id && !uniqueMentions.includes(postMeta.crt_by)) {
            await insertNoti({
              teamId, memId: postMeta.crt_by, notiTypeEnm: "sch_post_cmnt",
              notiNm: `${postMeta.sch_nm} · 새 댓글`,
              notiCont: `${commenterName}: ${preview}`,
              refId: parsed.entityId, refTypeEnm: "sch_post",
            })
          }
        }

        if (parsed.entityType === "gathering") {
          const { data: gthrMeta } = await admin
            .from("gthr_mst")
            .select("crt_by, gthr_nm")
            .eq("gthr_id", parsed.entityId)
            .maybeSingle()
          if (gthrMeta) {
            // 답글: 부모 댓글 작성자에게
            if (parsed.prntId) {
              const { data: parentCmnt } = await admin
                .from("cmnt_mst").select("mem_id").eq("cmnt_id", parsed.prntId).maybeSingle()
              const parentAuthorId = parentCmnt?.mem_id
              if (parentAuthorId && parentAuthorId !== member.id && !uniqueMentions.includes(parentAuthorId)) {
                await insertNoti({
                  teamId, memId: parentAuthorId, notiTypeEnm: "gthr_reply",
                  notiNm: `${gthrMeta.gthr_nm} · 답글`,
                  notiCont: `${commenterName}: ${preview}`,
                  refId: parsed.entityId, refTypeEnm: "gathering",
                })
              }
            }
            // 개설자 댓글: 최상위 댓글이고 개설자 본인이 아닐 때
            if (!parsed.prntId && gthrMeta.crt_by !== member.id && !uniqueMentions.includes(gthrMeta.crt_by)) {
              await insertNoti({
                teamId, memId: gthrMeta.crt_by, notiTypeEnm: "gthr_cmnt",
                notiNm: `${gthrMeta.gthr_nm} · 새 댓글`,
                notiCont: `${commenterName}: ${preview}`,
                refId: parsed.entityId, refTypeEnm: "gathering",
              })
            }
          }
        }

        // 멘션 알림 (여러 명)
        if (uniqueMentions.length > 0) {
          await insertNotiMany({
            teamId,
            memIds: uniqueMentions,
            notiTypeEnm: "cmnt_mention",
            notiNm: `${commenterName}님의 멘션`,
            notiCont: preview,
            refId: parsed.entityId,
            refTypeEnm: parsed.entityType,
          })
        }
      } catch (e) {
        console.error("[comment] 알림 발송 실패", e)
      }
    })

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

    return { ok: true as const }
  })
}
