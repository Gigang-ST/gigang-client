import { todayKST } from "@/lib/dayjs";
import type { CouponType } from "@/lib/validations/coupon";

/** 쿠폰 종류 화면 이름 — 화면·운영 MCP 가 같은 말을 쓴다 */
export const COUPON_TYPE_LABEL: Record<CouponType, string> = {
  SINGLET: "싱글렛 할인권",
  COMP_SUPPORT: "대회 참가지원",
  PRJ_FEE: "프로젝트 참가비 할인",
  ETC: "기타",
};

export function couponTypeLabel(code: string): string {
  return COUPON_TYPE_LABEL[code as CouponType] ?? "기타";
}

export type CouponStatus = "active" | "used" | "expired";

export const COUPON_STATUS_LABEL: Record<CouponStatus, string> = {
  active: "사용 가능",
  used: "사용함",
  expired: "기간 만료",
};

/**
 * 쿠폰 상태. 사용했으면 기간과 무관하게 `used`. 유효기간은 **그 날까지 유효**(KST) —
 * 만료일 당일은 아직 쓸 수 있고 다음 날부터 `expired`. 기한 없음(NULL)은 만료되지 않는다.
 * `today` 는 테스트용 주입(기본 오늘 KST).
 */
export function couponStatus(
  c: { used_yn: boolean; exp_dt: string | null },
  today: string = todayKST(),
): CouponStatus {
  if (c.used_yn) return "used";
  if (c.exp_dt && c.exp_dt < today) return "expired";
  return "active";
}
