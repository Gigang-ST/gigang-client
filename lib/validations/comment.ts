import { z } from "zod"

export const createCommentSchema = z.object({
  entityType: z.enum(["sch_post", "comp", "gathering"]),
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
