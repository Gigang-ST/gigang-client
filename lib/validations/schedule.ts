import { z } from "zod";

export const SCH_POST_TYPES = ["general", "race_entry", "event"] as const;
export type SchPostType = typeof SCH_POST_TYPES[number];

export const schPostTypeLabels: Record<SchPostType, string> = {
  general: "일반",
  race_entry: "대회접수",
  event: "이벤트",
};

export const schPostTypeInlineLabel: Partial<Record<SchPostType, string>> = {
  race_entry: "대회접수",
  event: "이벤트",
};

export const createSchPostSchema = z.object({
  team_id: z.string().uuid(),
  sch_nm: z.string().min(1, "일정명을 입력해 주세요.").max(100, "일정명은 100자 이내로 입력해 주세요."),
  post_type: z.enum(SCH_POST_TYPES).default("general"),
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
