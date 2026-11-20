import type { SupabaseClient } from "@supabase/supabase-js";

import { issueCouponsCore, listCouponsCore } from "@/lib/coupon/core";
import type { CouponStatus } from "@/lib/coupon/status";
import type { OperatorContext } from "@/lib/mcp/auth";
import { writeAudit } from "@/lib/mcp/dues";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";
import type { CouponIssueItem } from "@/lib/validations/coupon";

/**
 * 기강 운영 MCP — 쿠폰 기록 도구(#712).
 *
 * - `issue_coupons`: admin 전용 · `dry_run` 지원 · 감사행에는 **건수·쿠폰 id 만**(회원 id·내용·금액은 싣지 않는다).
 * - `list_coupons`: admin 은 팀 전체(회원 필터 가능), 일반 회원은 **내 쿠폰만**(앱에서 보이는 만큼).
 * 도메인 규칙은 앱 서버 액션과 같은 코어(`lib/coupon/core.ts`)를 부른다. `next/*` 를 모른다.
 */

type Db = SupabaseClient<Database>;

export async function issueCouponsViaMcp(
  db: Db,
  ctx: OperatorContext,
  input: { items: CouponIssueItem[]; dryRun?: boolean },
) {
  if (!ctx.is_admin) throw new ToolDeniedError();
  const result = await issueCouponsCore(db, {
    teamId: ctx.team_id,
    regMemId: ctx.mem_id,
    items: input.items,
    dryRun: input.dryRun,
  });
  if (!result.ok) throw new ToolInputError(result.message);

  let auditId: string | null = null;
  if (!result.dryRun) {
    auditId = await writeAudit(
      db,
      ctx,
      "issue_coupons",
      { count: input.items.length, cpn_ids: result.cpnIds },
      `발급 ${result.issued}건 · 건너뜀 ${result.skipped.length}건`,
    );
  }
  return {
    dry_run: result.dryRun,
    issued: result.issued,
    skipped: result.skipped,
    cpn_ids: result.cpnIds,
    audit_id: auditId,
  };
}

export async function listCouponsViaMcp(
  db: Db,
  ctx: OperatorContext,
  input: { memId?: string; status?: CouponStatus },
) {
  // 일반 회원은 인자와 무관하게 내 쿠폰만 — 남의 쿠폰을 id 로 찔러도 안 나온다
  const memId = ctx.is_admin ? input.memId : ctx.mem_id;
  const coupons = await listCouponsCore(db, { teamId: ctx.team_id, memId, status: input.status });
  return {
    count: coupons.length,
    coupons: coupons.map((c) => ({
      cpn_id: c.cpn_id,
      mem_id: c.mem_id,
      type: c.cpn_tp_cd,
      type_label: c.type_label,
      text: c.cpn_txt,
      amount: c.cpn_amt,
      exp_dt: c.exp_dt,
      status: c.status,
      status_label: c.status_label,
      used_dt: c.used_dt,
      used_memo: c.used_memo_txt,
    })),
  };
}
