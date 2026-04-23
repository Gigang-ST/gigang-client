import { z } from "zod";

/** 마일리지런 활동 종목 enum 값 */
const SPRT_ENM_KEYS = ["RUNNING", "TRAIL", "CYCLING", "SWIMMING"] as const;

/** 활동 로그 등록 폼 */
export const activityLogSchema = z.object({
  act_dt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다"),
  sprt_enm: z.enum(SPRT_ENM_KEYS, { message: "종목을 선택해 주세요" }),
  distance_km: z.number().positive("거리를 입력해주세요"),
  elevation_m: z.number().min(0).default(0),
  applied_mult_ids: z.array(z.string().uuid()).default([]),
  review: z.string().max(200).nullable().optional(),
});

export type ActivityLogInput = z.infer<typeof activityLogSchema>;

/** 마일리지런 활동 로그 다건 등록 폼 */
export const activityLogBatchSchema = z
  .array(activityLogSchema)
  .min(1, "최소 1건 이상 입력해 주세요")
  .max(20, "한 번에 최대 20건까지 입력할 수 있습니다");

export type ActivityLogBatchInput = z.infer<typeof activityLogBatchSchema>;

/** 마일리지런 프로젝트 참가 신청 폼 */
export const joinProjectSchema = z.object({
  evt_id: z.string().uuid(),
  init_goal: z.number().int().min(10, "최소 10 이상 입력해주세요"),
  has_singlet: z.boolean(),
});

export type JoinProjectInput = z.infer<typeof joinProjectSchema>;

/** 목표 거리 수정 폼 */
export const updateGoalSchema = z.object({
  goal_id: z.string().uuid(),
  new_goal: z.number().int().min(10, "최소 10 이상 입력해주세요"),
});

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
