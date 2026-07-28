import { z } from "zod";

/**
 * 한마디 상한 — 마일리지런 `review`(200자)와 같은 값.
 * 두 경로(전광판 직접 작성 / 마일리지런 자동 유입)가 같은 컬럼(`post_mst.cmnt_txt`)에
 * 담기므로 길이가 갈리면 자동 유입분만 잘려 보인다.
 */
export const POST_CMNT_MAX = 200;

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

/**
 * 기강이야기 운동기록 작성 입력 검증.
 *
 * **거리·종목이 없다.** 이 지면의 운동기록은 수치를 겨루는 자리가 아니라 친목·응원의
 * 자리다 — 사진 한 장과 한마디면 "오늘 뛰었다"가 전해진다. 수치가 필요한 기록은
 * 마일리지런이 맡고(`lib/validations/mileage.ts`), 거기서 사진을 올리면 이 지면에도
 * 같이 선다. 그래서 두 다이얼로그의 공통분모는 **사진·한마디·날짜** 셋뿐이고,
 * 필수 여부만 반대다: 여기선 사진이 필수(사진 없는 칸은 얼굴 격자가 된다),
 * 마일리지런에선 선택(수치가 본체라 사진 없이도 기록은 성립한다).
 *
 * 사진은 여기서 검증하지 않는다 — `File`은 FormData로 오므로 서버 액션이 크기·타입을 직접 본다.
 * 클라이언트 검증은 UX 편의고 실제 강제는 서버 액션이 한다(createPledgeSchema와 동일 원칙).
 */
export const createRecordFlexSchema = z.object({
  /**
   * 한마디는 **선택**이다. 이 경로에서 필수인 건 사진 하나뿐 — 사진이 지면에 서는
   * 조건이고 글은 거든다. 마일리지런 후기도 선택이라 두 경로 규칙이 여기서 맞는다
   * (`post_mst.cmnt_txt` nullable · record_flex CHECK도 풀려 있다).
   */
  cmnt_txt: z
    .string()
    .trim()
    .max(POST_CMNT_MAX, `한마디는 ${POST_CMNT_MAX}자 이하로 입력해주세요.`)
    .optional(),
  act_dt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다."),
});

export type CreateRecordFlexInput = z.infer<typeof createRecordFlexSchema>;
