"use server"

import { revalidatePath } from "next/cache"

import { dayjs } from "@/lib/dayjs"
import { getCurrentMember } from "@/lib/queries/member"
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
  const { member, supabase } = await getCurrentMember()
  if (!member) return { ok: false as const, message: "로그인 필요" }

  const { teamId } = await getRequestTeamContext()
  const admin = createAdminClient()

  // 1단계 답글만 허용 — prnt_id가 루트 댓글인지 확인
  if (parsed.prntId) {
    const { data: parent } = await supabase
      .from("cmnt_mst")
      .select("prnt_id")
      .eq("cmnt_id", parsed.prntId)
      .single()
    if (parent?.prnt_id) return { ok: false as const, message: "답글의 답글은 허용되지 않습니다." }
  }

  const { data: cmnt, error } = await supabase
    .from("cmnt_mst")
    .insert({
      team_id: teamId,
      entity_type: parsed.entityType,
      entity_id: parsed.entityId,
      prnt_id: parsed.prntId ?? null,
      mem_id: member.id,
      cont_txt: parsed.contTxt,
    })
    .select()
    .single()

  if (error || !cmnt) return { ok: false as const, message: "댓글 저장 실패" }

  // 멘션 저장 + 알림
  const uniqueMentions = [...new Set(parsed.mentionedMemIds)].filter((id) => id !== member.id)
  if (uniqueMentions.length > 0) {
    await admin
      .from("cmnt_mention_rel")
      .insert(uniqueMentions.map((memId) => ({ cmnt_id: cmnt.cmnt_id, mem_id: memId })))
    await admin.from("noti_mst").insert(
      uniqueMentions.map((memId) => ({
        team_id: teamId,
        mem_id: memId,
        noti_type_enm: "cmnt_mention",
        noti_nm: `${member.full_name}님이 댓글에서 멘션했습니다`,
        noti_cont: parsed.contTxt.slice(0, 100),
        ref_id: parsed.entityId,
        ref_type_enm: parsed.entityType,
      }))
    )
  }

  // 소식 댓글 알림 — 소식 작성자 (루트 댓글만, 본인·멘션 중복 제외, 같은 글 알림 그룹핑)
  if (!parsed.prntId && parsed.entityType === "sch_post") {
    const { data: post } = await admin
      .from("sch_post_mst")
      .select("crt_by, sch_nm")
      .eq("sch_post_id", parsed.entityId)
      .single()
    if (post && post.crt_by !== member.id && !uniqueMentions.includes(post.crt_by)) {
      const { data: existingNoti } = await admin
        .from("noti_mst")
        .select("noti_id, noti_nm")
        .eq("mem_id", post.crt_by)
        .eq("ref_id", parsed.entityId)
        .eq("noti_type_enm", "sch_post_cmnt")
        .eq("read_yn", false)
        .eq("del_yn", false)
        .maybeSingle()

      if (existingNoti) {
        // 기존 메시지에서 카운트 파싱 후 +1 (DB 재조회 없이 race condition 최소화)
        const match = existingNoti.noti_nm.match(/새 댓글 (\d+)개/)
        const prevCount = match ? parseInt(match[1], 10) : 1
        const count = prevCount + 1
        await admin.from("noti_mst").update({
          noti_nm: `'${post.sch_nm}'에 새 댓글 ${count}개가 달렸습니다`,
          noti_cont: parsed.contTxt.slice(0, 100),
        }).eq("noti_id", existingNoti.noti_id)
      } else {
        await admin.from("noti_mst").insert({
          team_id: teamId,
          mem_id: post.crt_by,
          noti_type_enm: "sch_post_cmnt",
          noti_nm: `'${post.sch_nm}'에 새 댓글이 달렸습니다`,
          noti_cont: parsed.contTxt.slice(0, 100),
          ref_id: parsed.entityId,
          ref_type_enm: "sch_post",
        })
      }
    }
  }

  revalidatePath("/")
  return { ok: true as const, data: cmnt }
}

export async function updateComment(input: UpdateCommentInput) {
  const parsed = updateCommentSchema.parse(input)
  const { member, supabase } = await getCurrentMember()
  if (!member) return { ok: false as const, message: "로그인 필요" }

  const admin = createAdminClient()

  // 답글 달린 댓글 수정 불가
  const { count } = await supabase
    .from("cmnt_mst")
    .select("cmnt_id", { count: "exact", head: true })
    .eq("prnt_id", parsed.cmntId)
    .eq("del_yn", false)
  if ((count ?? 0) > 0) return { ok: false as const, message: "답글이 달린 댓글은 수정할 수 없습니다." }

  const { error } = await supabase
    .from("cmnt_mst")
    .update({ cont_txt: parsed.contTxt, edit_yn: true, upd_at: dayjs().toISOString() })
    .eq("cmnt_id", parsed.cmntId)
    .eq("mem_id", member.id)
    .eq("del_yn", false)

  if (error) return { ok: false as const, message: "댓글 수정 실패" }

  // 멘션 갱신
  await admin.from("cmnt_mention_rel").delete().eq("cmnt_id", parsed.cmntId)
  const uniqueMentions = [...new Set(parsed.mentionedMemIds)].filter((id) => id !== member.id)
  if (uniqueMentions.length > 0) {
    await admin
      .from("cmnt_mention_rel")
      .insert(uniqueMentions.map((memId) => ({ cmnt_id: parsed.cmntId, mem_id: memId })))
  }

  revalidatePath("/")
  return { ok: true as const }
}

export async function deleteComment(input: DeleteCommentInput) {
  const parsed = deleteCommentSchema.parse(input)
  const { member, supabase } = await getCurrentMember()
  if (!member) return { ok: false as const, message: "로그인 필요" }

  const admin = createAdminClient()

  if (!member.admin) {
    // 일반 멤버: 답글 달린 댓글 삭제 불가
    const { count } = await supabase
      .from("cmnt_mst")
      .select("cmnt_id", { count: "exact", head: true })
      .eq("prnt_id", parsed.cmntId)
      .eq("del_yn", false)
    if ((count ?? 0) > 0) return { ok: false as const, message: "답글이 달린 댓글은 삭제할 수 없습니다." }
  }

  // 관리자: admin client(RLS bypass), 일반: supabase(RLS — 본인만)
  const db = member.admin ? admin : supabase
  const { error } = await db
    .from("cmnt_mst")
    .update({ del_yn: true, upd_at: dayjs().toISOString() })
    .eq("cmnt_id", parsed.cmntId)

  if (error) return { ok: false as const, message: "댓글 삭제 실패" }

  revalidatePath("/")
  return { ok: true as const }
}
