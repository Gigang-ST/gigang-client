import { z } from "zod";

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

export const createGthrSchema = z.object({
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

export const updateGthrSchema = createGthrSchema.omit({ team_id: true }).partial().extend({
  gthr_id: z.string().uuid(),
});

export type CreateGthrInput = z.infer<typeof createGthrSchema>;
export type UpdateGthrInput = z.infer<typeof updateGthrSchema>;
