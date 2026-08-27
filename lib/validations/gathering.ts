import { z } from "zod";

import { dayjs } from "@/lib/dayjs";

export const GTHR_TYPES = ["general", "regular", "event"] as const;
export type GthrType = (typeof GTHR_TYPES)[number];

export const gthrTypeLabels: Record<GthrType, string> = {
  general: "일반",
  regular: "정기",
  event: "이벤트",
};

export const GTHR_SPRT_TYPES = ["running", "trail_run", "hyrox", "swimming", "cycling"] as const;
export type GthrSprtType = (typeof GTHR_SPRT_TYPES)[number];

export const gthrSprtLabels: Record<GthrSprtType, string> = {
  running: "러닝",
  trail_run: "트레일러닝",
  hyrox: "하이록스",
  swimming: "수영",
  cycling: "자전거",
};

export const END_BEFORE_START_ERROR = "종료 일시는 시작 일시보다 빠를 수 없어요.";

/** 참여조건 값 범위 — DB CHECK(ck_gthr_mst_req_attd_range)와 같은 숫자를 쓴다. */
export const REQ_ATTD_CNT_MAX = 100;
export const REQ_ATTD_MONTHS_MAX = 36;

export const REQ_ATTD_PAIR_ERROR = "기간만 정할 수는 없어요. 참석 횟수를 입력해 주세요.";

/**
 * 참여조건의 주인은 **횟수**다. 기간(`req_attd_months`)은 선택이고, 비우면 전체 기간
 * 누적으로 센다. 반대로 기간만 있고 횟수가 없으면 판정할 대상이 없으므로 그건 막는다.
 * DB 에도 같은 CHECK(ck_gthr_mst_req_attd)가 있어 이중 방어.
 *
 * ⚠️ `updateGthrSchema` 는 `.partial()` 이라 **한쪽만 담긴 수정은 여기서 못 잡는다**
 * (둘 다 undefined 면 통과해야 하므로). 서버 액션이 기존값과 합쳐 다시 본다 —
 * `endNotBeforeStart` 와 같은 구조다.
 */
function reqAttdPaired(v: { req_attd_cnt?: number | null; req_attd_months?: number | null }) {
  return v.req_attd_months == null || v.req_attd_cnt != null;
}

const REQ_ATTD_PAIR_CHECK = {
  message: REQ_ATTD_PAIR_ERROR,
  path: ["req_attd_cnt"],
};

/**
 * 종료가 시작보다 앞선 모임을 입력 시점에 막는다.
 *
 * 실제로 뚫린 적이 있다(#495): 종료월 오타(11월→10월)로 들어간 모임이 달력 뷰에서만
 * 통째로 사라졌다. 리스트·상세·공유 링크에서는 멀쩡히 보이고 신청도 계속 받아서,
 * 운영자는 존재를 모르는 채 참가자만 쌓였다.
 *
 * 둘 다 있을 때만 판정한다 — `end_at`은 선택값이고, 수정(`updateGthrSchema`)은
 * `.partial()`이라 한쪽만 올 수 있다. 한쪽만 온 수정은 스키마가 못 잡으므로
 * 서버 액션이 기존값과 합쳐 다시 본다(`updateGathering`).
 */
function endNotBeforeStart(v: { stt_at?: string | null; end_at?: string | null }) {
  if (!v.stt_at || !v.end_at) return true;
  const stt = dayjs.tz(v.stt_at, "Asia/Seoul");
  const end = dayjs.tz(v.end_at, "Asia/Seoul");
  // 파싱 불가는 여기서 판정하지 않는다 — 형식 오류는 각 필드가 낼 몫이다.
  if (!stt.isValid() || !end.isValid()) return true;
  return !end.isBefore(stt);
}

const END_AFTER_START_CHECK = {
  message: END_BEFORE_START_ERROR,
  path: ["end_at"],
};

/**
 * 모임 필드 원본. refinement 없는 순수 객체로 남겨 둔다 —
 * zod v4는 refinement가 붙은 object에 `.omit()`/`.partial()`을 부르면 던진다
 * (".omit() cannot be used on object schemas containing refinements").
 * 파생 스키마는 여기서 뽑고, 검사는 끝단마다 각자 붙인다.
 */
const gthrBaseSchema = z.object({
  team_id: z.string().uuid(),
  gthr_nm: z.string().min(1, "제목을 입력해 주세요.").max(100, "제목은 100자 이내로 입력해 주세요."),
  gthr_type_enm: z.enum(GTHR_TYPES, { message: "유형을 선택해 주세요." }),
  sprt_cd: z.enum(GTHR_SPRT_TYPES, { message: "종목을 선택해 주세요." }),
  stt_at: z.string().min(1, "시작 일시를 입력해 주세요."),
  end_at: z.string().nullable().optional(),
  loc_txt: z.string().max(200).nullable().optional(),
  desc_txt: z.string().max(2000).nullable().optional(),
  max_prt_cnt: z.number().int().min(1, "최대 인원은 1명 이상이어야 합니다.").nullable().optional(),
  // ── 참여조건 · 승인제 (둘 다 모임별 옵션이고 서로 독립) ──
  aprv_req_yn: z.boolean().optional(),
  req_attd_cnt: z
    .number()
    .int()
    .min(1, "참석 횟수는 1회 이상이어야 합니다.")
    .max(REQ_ATTD_CNT_MAX, `참석 횟수는 ${REQ_ATTD_CNT_MAX}회 이하로 입력해 주세요.`)
    .nullable()
    .optional(),
  req_attd_months: z
    .number()
    .int()
    .min(1, "기간은 1개월 이상이어야 합니다.")
    .max(REQ_ATTD_MONTHS_MAX, `기간은 ${REQ_ATTD_MONTHS_MAX}개월 이하로 입력해 주세요.`)
    .nullable()
    .optional(),
});

export const createGthrSchema = gthrBaseSchema
  .refine(endNotBeforeStart, END_AFTER_START_CHECK)
  .refine(reqAttdPaired, REQ_ATTD_PAIR_CHECK);

/** 폼용 — team_id는 서버가 채운다. `createGthrSchema.omit()`은 위 이유로 못 쓴다. */
export const createGthrFormSchema = gthrBaseSchema
  .omit({ team_id: true })
  .refine(endNotBeforeStart, END_AFTER_START_CHECK)
  .refine(reqAttdPaired, REQ_ATTD_PAIR_CHECK);

export const updateGthrSchema = gthrBaseSchema
  .omit({ team_id: true })
  .partial()
  .extend({ gthr_id: z.string().uuid() })
  .refine(endNotBeforeStart, END_AFTER_START_CHECK)
  .refine(reqAttdPaired, REQ_ATTD_PAIR_CHECK);

export type CreateGthrInput = z.infer<typeof createGthrSchema>;
export type CreateGthrFormInput = z.infer<typeof createGthrFormSchema>;
export type UpdateGthrInput = z.infer<typeof updateGthrSchema>;
