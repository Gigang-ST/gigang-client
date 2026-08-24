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
});

export const createGthrSchema = gthrBaseSchema.refine(endNotBeforeStart, END_AFTER_START_CHECK);

/** 폼용 — team_id는 서버가 채운다. `createGthrSchema.omit()`은 위 이유로 못 쓴다. */
export const createGthrFormSchema = gthrBaseSchema
  .omit({ team_id: true })
  .refine(endNotBeforeStart, END_AFTER_START_CHECK);

export const updateGthrSchema = gthrBaseSchema
  .omit({ team_id: true })
  .partial()
  .extend({ gthr_id: z.string().uuid() })
  .refine(endNotBeforeStart, END_AFTER_START_CHECK);

export type CreateGthrInput = z.infer<typeof createGthrSchema>;
export type CreateGthrFormInput = z.infer<typeof createGthrFormSchema>;
export type UpdateGthrInput = z.infer<typeof updateGthrSchema>;
