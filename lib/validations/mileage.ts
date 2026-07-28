import { z } from "zod";

/** 마일리지런 활동 종목 enum 값 */
const SPRT_ENM_KEYS = ["RUNNING", "TRAIL", "CYCLING", "SWIMMING"] as const;

/** 활동 로그 등록 폼 */
export const activityLogSchema = z.object({
  act_dt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다"),
  sprt_enm: z.enum(SPRT_ENM_KEYS, { message: "종목을 선택해 주세요" }),
  distance_km: z
    .number()
    .positive("거리를 입력해주세요")
    // dst_km은 numeric(6,2) — 소수 둘째 자리까지만 허용해 저장값/표시값 불일치 방지
    .multipleOf(0.01, "거리는 소수점 둘째 자리까지 입력할 수 있어요"),
  elevation_m: z.number().min(0).default(0),
  applied_mult_ids: z.array(z.string().uuid()).default([]),
  review: z.string().max(200).nullable().optional(),
  /**
   * 사진 공개 URL(선택). 마일리지런은 수치가 본체라 사진 없이도 기록이 성립한다.
   * 값이 있으면 DB 트리거가 이 기록을 기강이야기 운동기록에도 세운다(사진이 게이트).
   *
   * 폼은 파일을 `uploadActivityPhoto` 액션으로 먼저 올려 URL을 받고, 그 URL만 여기 담는다 —
   * 파일 자체를 이 스키마에 넣지 않는 건 `File`이 브라우저 전용 타입이라 서버 액션 경계를
   * JSON으로 넘길 수 없기 때문이다.
   */
  photo_url: z.string().url().nullable().optional(),
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
