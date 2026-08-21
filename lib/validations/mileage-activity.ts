import { z } from "zod";

/**
 * 마일리지런 활동 로그의 **사진 없는 본체 스키마**.
 *
 * `lib/validations/mileage.ts` 에서 갈라 둔 이유: 그 파일은 사진 URL 출처 검증
 * (`isPostPhotoUrl` → `lib/supabase/public-env`)을 물고 있어, **import 하는 순간
 * Supabase 공개 환경변수가 없으면 모듈 평가가 실패한다.** 운영 MCP 는 사진을 아예 받을 수
 * 없는데(`File` 이 JSON 경계를 못 넘는다) 그 의존만 따라 들어와, 검증 규칙을 공유하려다
 * 도메인 모듈과 테스트가 환경변수에 묶였다.
 *
 * 그래서 **수치·날짜·후기 규칙은 여기**, 사진 규칙은 저기. 앱 폼은 여기에 `photo_url` 을
 * 얹어 쓰고(`activityLogSchema`), MCP 는 이 파일만 쓴다 — 규칙은 여전히 한 벌이다.
 */

/** 마일리지런 활동 종목 enum 값 */
export const SPRT_ENM_KEYS = ["RUNNING", "TRAIL", "CYCLING", "SWIMMING"] as const;

export const activityLogBaseSchema = z.object({
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
});
