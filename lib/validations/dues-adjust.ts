import { z } from "zod";

/** 개시잔액 조정 — 금액은 0이 아닌 정수(+/-), 사유 필수. */
export const balanceAdjustSchema = z.object({
  adjAmt: z
    .number({ error: "금액을 입력해 주세요." })
    .int("원 단위 정수만 입력할 수 있어요.")
    .refine((v) => v !== 0, "0원은 조정할 수 없어요.")
    .refine((v) => Math.abs(v) <= 10_000_000, "금액이 너무 커요."),
  reason: z.string().trim().min(2, "사유를 2자 이상 적어 주세요.").max(200, "사유는 200자까지예요."),
});

export const balanceAdjustRevertSchema = z.object({
  adjId: z.string().uuid(),
  reason: z.string().trim().min(2, "되돌리는 사유를 2자 이상 적어 주세요.").max(200, "사유는 200자까지예요."),
});
