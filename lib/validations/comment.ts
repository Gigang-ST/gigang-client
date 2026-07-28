import { z } from "zod"

export const createCommentSchema = z.object({
  // "post" = 기강이야기 운동기록(post_mst). DB CHECK 제약(cmnt_mst_entity_type_check)과
  // CommentSection의 entityType 유니온이 같이 움직여야 한다 — 셋 중 하나만 넓히면 조용히 막힌다.
  entityType: z.enum(["sch_post", "comp", "gathering", "post"]),
  entityId: z.string().uuid(),
  contTxt: z.string().min(1, "내용을 입력해주세요").max(1000, "1000자 이내로 입력해주세요"),
  prntId: z.string().uuid().optional(),
  mentionedMemIds: z.array(z.string().uuid()).default([]),
})

export const updateCommentSchema = z.object({
  cmntId: z.string().uuid(),
  contTxt: z.string().min(1).max(1000),
  mentionedMemIds: z.array(z.string().uuid()).default([]),
})

export const deleteCommentSchema = z.object({
  cmntId: z.string().uuid(),
})

export type CreateCommentInput = z.infer<typeof createCommentSchema>
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>
export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>
