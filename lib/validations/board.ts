import { z } from "zod";

export const createPostSchema = z.object({
  team_id: z.string().uuid(),
  post_type_enm: z.enum(["notice", "update"]),
  post_nm: z.string().trim().min(1, "제목을 입력해주세요.").max(200, "제목은 200자 이하로 입력해주세요."),
  post_cont: z.string().trim().min(1, "내용을 입력해주세요."),
  pin_yn: z.boolean(),
});

export const updatePostSchema = createPostSchema.partial().omit({ team_id: true }).extend({
  post_id: z.string().uuid(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
