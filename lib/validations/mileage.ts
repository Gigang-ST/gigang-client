import { z } from "zod";

import { isPostPhotoUrl } from "@/lib/storage/post-photo-url";
import { activityLogBaseSchema } from "@/lib/validations/mileage-activity";

export { SPRT_ENM_KEYS } from "@/lib/validations/mileage-activity";

/**
 * 활동 로그 등록 폼 = 본체(`activityLogBaseSchema`) + 사진.
 *
 * 수치·날짜·후기 규칙은 `mileage-activity.ts` 에 있다 — 사진 URL 검증이 Supabase 공개
 * 환경변수를 물고 있어, 그 규칙까지 여기 두면 사진을 받지 않는 경로(운영 MCP)까지 환경변수에
 * 묶인다.
 */
export const activityLogSchema = activityLogBaseSchema.extend({
  /**
   * 사진 공개 URL(선택). 마일리지런은 수치가 본체라 사진 없이도 기록이 성립한다.
   * 값이 있으면 DB 트리거가 이 기록을 기강이야기 운동기록에도 세운다(사진이 게이트).
   *
   * 폼은 파일을 `uploadActivityPhoto` 액션으로 먼저 올려 URL을 받고, 그 URL만 여기 담는다 —
   * 파일 자체를 이 스키마에 넣지 않는 건 `File`이 브라우저 전용 타입이라 서버 액션 경계를
   * JSON으로 넘길 수 없기 때문이다.
   *
   * **출처를 못 박는다**: URL 모양만 보면(`z.url()`) 아무 외부 주소나 통과하는데, 이 값은
   * 그대로 저장돼 트리거가 전광판에 복제한다 — 남의 서버 이미지나 추적 픽셀이 지면에 걸리면
   * 열람자 IP가 그쪽으로 샌다. 우리 Storage의 `post-photos` 공개 URL만 받는다.
   * 소유권(본인 폴더인가)은 mem_id를 아는 서버 액션이 따로 확인한다.
   */
  photo_url: z
    .string()
    .refine(isPostPhotoUrl, "사진 주소가 올바르지 않습니다")
    .nullable()
    .optional(),
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
