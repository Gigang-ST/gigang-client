"use server";

import { revalidatePath } from "next/cache";

import { withDuesAdmin } from "@/lib/actions/dues-guard";
import { cancelCouponCore, issueCouponsCore, unredeemCouponCore, redeemCouponCore } from "@/lib/coupon/core";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CouponIssueItem } from "@/lib/validations/coupon";

/**
 * 쿠폰 기록 관리 액션(#712) — 운영진 전용 + 회비 기능이 켜진 팀만(`withDuesAdmin`).
 * 도메인 규칙은 운영 MCP 와 같은 코어(`lib/coupon/core.ts`)를 부른다.
 */

function revalidateCoupons() {
  revalidatePath("/admin/dues/coupons");
  revalidatePath("/profile/coupons");
}

export async function issueCoupons(items: CouponIssueItem[]) {
  return withDuesAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const result = await issueCouponsCore(createAdminClient(), { teamId, regMemId: member.id, items });
    if (!result.ok) return result;
    if (result.issued === 0) {
      return { ok: false as const, message: result.skipped[0]?.reason ?? "발급할 쿠폰이 없어요." };
    }
    revalidateCoupons();
    return { ok: true as const, issued: result.issued, skipped: result.skipped.length };
  });
}

export async function redeemCoupon(input: { cpnId: string; usedDt?: string; memo?: string }) {
  return withDuesAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const result = await redeemCouponCore(createAdminClient(), { teamId, usedByMemId: member.id, ...input });
    if (result.ok) revalidateCoupons();
    return result;
  });
}

export async function unredeemCoupon(cpnId: string) {
  return withDuesAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const result = await unredeemCouponCore(createAdminClient(), { teamId, cpnId });
    if (result.ok) revalidateCoupons();
    return result;
  });
}

export async function cancelCoupon(cpnId: string) {
  return withDuesAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const result = await cancelCouponCore(createAdminClient(), { teamId, cpnId });
    if (result.ok) revalidateCoupons();
    return result;
  });
}
