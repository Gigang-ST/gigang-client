import { z } from "zod";

/**
 * 한마디 상한 — 마일리지런 `review`(200자)와 같은 값.
 * 두 경로(전광판 직접 작성 / 마일리지런 자동 유입)가 같은 컬럼(`post_mst.cmnt_txt`)에
 * 담기므로 길이가 갈리면 자동 유입분만 잘려 보인다.
 */
export const POST_CMNT_MAX = 200;

/** 거리 상한 — 하루 활동으로 물리적으로 가능한 범위(울트라·장거리 라이딩 포함) */
export const POST_DST_KM_MAX = 500;

/** 사진 업로드 상한 — 아바타(10MB)와 동일 */
export const POST_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** 허용 이미지 타입 — 아바타 업로드와 동일(HEIC는 서버에서 변환) */
export const POST_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** 종목 — 마일리지런 `evt_mlg_sprt_enm`과 같은 값 집합(자동 유입분과 표기를 맞춘다) */
export const POST_SPRT_KEYS = [
  "RUNNING",
  "TRAIL",
  "CYCLING",
  "SWIMMING",
] as const;

/**
 * 기록 자랑 작성 입력 검증.
 *
 * 사진은 여기서 검증하지 않는다 — `File`은 FormData로 오므로 서버 액션이 크기·타입을 직접 본다.
 * 클라이언트 검증은 UX 편의고 실제 강제는 서버 액션 + DB CHECK가 한다(createPledgeSchema와 동일 원칙).
 */
export const createRecordFlexSchema = z.object({
  cmnt_txt: z
    .string()
    .trim()
    .min(1, "한마디를 입력해주세요.")
    .max(POST_CMNT_MAX, `한마디는 ${POST_CMNT_MAX}자 이하로 입력해주세요.`),
  dst_km: z
    .number()
    .positive("거리를 입력해주세요.")
    // dst_km은 numeric(6,2) — 마일리지런과 같은 정밀도로 맞춰 저장값/표시값 불일치를 막는다
    .multipleOf(0.01, "거리는 소수점 둘째 자리까지 입력할 수 있어요.")
    .max(POST_DST_KM_MAX, `거리는 ${POST_DST_KM_MAX}km 이하로 입력해주세요.`),
  sprt_enm: z.enum(POST_SPRT_KEYS, { message: "종목을 선택해 주세요." }),
  act_dt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다."),
});

export type CreateRecordFlexInput = z.infer<typeof createRecordFlexSchema>;
