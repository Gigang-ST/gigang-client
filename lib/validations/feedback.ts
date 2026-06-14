import { z } from "zod";

export const submitFeedbackSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "내용을 입력해주세요.")
    .max(2000, "2000자 이내로 작성해주세요."),
});

export const adminRespondSchema = z.object({
  adminNote: z
    .string()
    .trim()
    .max(2000, "2000자 이내로 작성해주세요.")
    .optional(),
});

export const adminUpdateStatusSchema = z.object({
  status: z.enum(["open", "in_review", "done"]),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
export type AdminRespondInput = z.infer<typeof adminRespondSchema>;
export type AdminUpdateStatusInput = z.infer<typeof adminUpdateStatusSchema>;
export type FeedbackStatus = "open" | "in_review" | "done";
