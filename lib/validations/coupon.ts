import { z } from "zod";

/** 쿠폰 종류 — 코드는 DB CHECK(`ck_cpn_mst_cpn_tp_cd`)와 같아야 한다 */
export const COUPON_TYPES = ["SINGLET", "COMP_SUPPORT", "PRJ_FEE", "ETC"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const COUPON_TEXT_MAX = 200;
export const COUPON_MEMO_MAX = 200;
/** 한 번에 발급할 수 있는 쿠폰 수 — 송년회 한 번에 나눠 주는 규모를 훑을 수 있는 크기 */
export const COUPON_ISSUE_MAX = 100;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 해요.");

/** 쿠폰 1장 발급 입력 — 금액·유효기간은 선택(빈칸 허용) */
export const couponIssueItemSchema = z.object({
  memId: z.string().uuid("회원 id 가 올바르지 않아요."),
  cpnTpCd: z.enum(COUPON_TYPES),
  cpnTxt: z.string().trim().min(1, "쿠폰 내용을 적어 주세요.").max(COUPON_TEXT_MAX, `쿠폰 내용은 ${COUPON_TEXT_MAX}자까지예요.`),
  cpnAmt: z.number().int("금액은 정수(원)예요.").min(0, "금액은 0 이상이에요.").nullable().optional(),
  expDt: dateStr.nullable().optional(),
});
export type CouponIssueItem = z.infer<typeof couponIssueItemSchema>;

export const couponUseSchema = z.object({
  cpnId: z.string().uuid(),
  usedDt: dateStr.optional(),
  memo: z.string().trim().max(COUPON_MEMO_MAX, `메모는 ${COUPON_MEMO_MAX}자까지예요.`).nullable().optional(),
});
