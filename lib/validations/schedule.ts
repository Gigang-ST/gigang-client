import { z } from "zod";

export const createSchPostSchema = z.object({
  team_id: z.string().uuid(),
  sch_nm: z.string().min(1, "일정명을 입력해 주세요.").max(100, "일정명은 100자 이내로 입력해 주세요."),
  evt_stt_at: z.string().min(1, "시작 일시를 입력해 주세요."),
  evt_end_at: z.string().nullable().optional(),
  url: z.string().url("올바른 URL 형식으로 입력해 주세요.").nullable().optional().or(z.literal("")),
  cont_txt: z.string().max(1000).nullable().optional(),
});

export const updateSchPostSchema = createSchPostSchema.partial().extend({
  sch_post_id: z.string().uuid(),
});

export type CreateSchPostInput = z.infer<typeof createSchPostSchema>;
export type UpdateSchPostInput = z.infer<typeof updateSchPostSchema>;
