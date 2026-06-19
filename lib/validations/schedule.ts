import { z } from "zod";

import { SCH_POST_TYPES } from "@/lib/validations/schedule-types";

export { SCH_POST_TYPES, schPostTypeLabels, schPostTypeInlineLabel } from "@/lib/validations/schedule-types";
export type { SchPostType } from "@/lib/validations/schedule-types";

export const createSchPostSchema = z.object({
  team_id: z.string().uuid(),
  sch_nm: z.string().min(1, "제목을 입력해 주세요.").max(100, "제목은 100자 이내로 입력해 주세요."),
  post_type: z.enum(SCH_POST_TYPES, { message: "유형을 선택해 주세요." }),
  evt_stt_at: z.string().min(1, "시작 일시를 입력해 주세요."),
  evt_end_at: z.string().nullable().optional(),
  url: z.string().url("올바른 URL 형식으로 입력해 주세요.").nullable().optional().or(z.literal("")),
  cont_txt: z.string().max(1000).nullable().optional(),
});

export const updateSchPostSchema = createSchPostSchema.omit({ team_id: true }).partial().extend({
  sch_post_id: z.string().uuid(),
});

export type CreateSchPostInput = z.infer<typeof createSchPostSchema>;
export type UpdateSchPostInput = z.infer<typeof updateSchPostSchema>;
