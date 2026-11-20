import type { SupabaseClient } from "@supabase/supabase-js";

import { isMemIdInTeam } from "@/lib/actions/team-scope";
import { COUPON_STATUS_LABEL, couponStatus, couponTypeLabel, type CouponStatus } from "@/lib/coupon/status";
import { todayKST } from "@/lib/dayjs";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Database } from "@/lib/supabase/database.types";
import {
  COUPON_ISSUE_MAX,
  couponIssueItemSchema,
  couponUseSchema,
  type CouponIssueItem,
} from "@/lib/validations/coupon";

/**
 * 쿠폰 기록(#712) 도메인 코어 — **클라이언트 주입식**이다. 운영 화면 서버 액션과 운영 MCP 가 같이 쓴다
 * (액션은 세션 쿠키에, MCP 는 토큰에 묶여 서로 못 부르므로). `next/*` 를 모른다 — 캐시 무효화는 각 경로 몫.
 *
 * 기록 장부일 뿐이다: 금액 자동 차감·지원금 연동은 없고, 「사용 처리」는 사용일과 메모만 남긴다.
 * 모든 쓰기는 `team_id` 로 한 번 더 좁힌다(service_role 이라 RLS 를 건너뛰므로 팀 경계를 여기서 지킨다).
 */

type Db = SupabaseClient<Database>;

export type CouponRow = {
  cpn_id: string;
  mem_id: string;
  cpn_tp_cd: string;
  cpn_txt: string;
  cpn_amt: number | null;
  exp_dt: string | null;
  used_yn: boolean;
  used_dt: string | null;
  used_memo_txt: string | null;
  crt_at: string;
};

const COUPON_COLS = "cpn_id, mem_id, cpn_tp_cd, cpn_txt, cpn_amt, exp_dt, used_yn, used_dt, used_memo_txt, crt_at";

export type CouponView = CouponRow & {
  status: CouponStatus;
  status_label: string;
  type_label: string;
};

export function toCouponView(row: CouponRow, today: string = todayKST()): CouponView {
  const status = couponStatus(row, today);
  return { ...row, status, status_label: COUPON_STATUS_LABEL[status], type_label: couponTypeLabel(row.cpn_tp_cd) };
}

export type CouponResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };

// ─────────────────────────────── 발급 ───────────────────────────────

export type IssueSkip = { index: number; reason: string };

/**
 * 쿠폰 발급(여러 장). 검증을 못 넘은 항목은 `skipped` 에 사유와 함께 남고 나머지는 진행한다.
 * `dryRun` 이면 같은 검증만 하고 쓰지 않는다. 같은 회원·종류·내용·유효기간의 쿠폰은 여러 장일 수 있으므로
 * (송년회 쿠폰은 같은 걸 둘 줄 수도 있다) 중복으로 거르지 않는다 — 재시도 중복은 호출자가 `list` 로 확인한다.
 */
export async function issueCouponsCore(
  db: Db,
  input: { teamId: string; regMemId: string; items: CouponIssueItem[]; dryRun?: boolean },
): Promise<CouponResult<{ issued: number; skipped: IssueSkip[]; dryRun: boolean; cpnIds: string[] }>> {
  const dryRun = Boolean(input.dryRun);
  if (input.items.length === 0) return { ok: false, message: "발급할 쿠폰이 없어요." };
  if (input.items.length > COUPON_ISSUE_MAX) {
    return { ok: false, message: `한 번에 ${COUPON_ISSUE_MAX}장까지 발급할 수 있어요.` };
  }

  const skipped: IssueSkip[] = [];
  const valid: { index: number; item: CouponIssueItem }[] = [];
  const memOk = new Map<string, boolean>();
  for (const [index, raw] of input.items.entries()) {
    const parsed = couponIssueItemSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ index, reason: parsed.error.issues[0]?.message ?? "입력이 올바르지 않아요." });
      continue;
    }
    const item = parsed.data;
    if (!memOk.has(item.memId)) memOk.set(item.memId, await isMemIdInTeam(db, input.teamId, item.memId));
    if (!memOk.get(item.memId)) {
      skipped.push({ index, reason: "이 팀 회원을 찾을 수 없어요." });
      continue;
    }
    valid.push({ index, item });
  }

  if (dryRun || valid.length === 0) {
    return { ok: true, issued: dryRun ? valid.length : 0, skipped, dryRun, cpnIds: [] };
  }

  const { data, error } = await db
    .from("cpn_mst")
    .insert(
      valid.map(({ item }) => ({
        team_id: input.teamId,
        mem_id: item.memId,
        cpn_tp_cd: item.cpnTpCd,
        cpn_txt: item.cpnTxt,
        cpn_amt: item.cpnAmt ?? null,
        exp_dt: item.expDt ?? null,
        reg_by_mem_id: input.regMemId,
      })),
    )
    .select("cpn_id");
  if (error) return { ok: false, message: "쿠폰 발급에 실패했어요." };
  return { ok: true, issued: data?.length ?? valid.length, skipped, dryRun, cpnIds: (data ?? []).map((r) => r.cpn_id) };
}

// ─────────────────────────────── 조회 ───────────────────────────────

/** 팀 쿠폰 목록(취소분 제외). `memId` 를 주면 그 회원 것만. 상태는 오늘(KST) 기준으로 계산한다. */
export async function listCouponsCore(
  db: Db,
  input: { teamId: string; memId?: string; status?: CouponStatus; today?: string },
): Promise<CouponView[]> {
  const rows = await fetchAllRows<CouponRow>(() => {
    let q = db
      .from("cpn_mst")
      .select(COUPON_COLS)
      .eq("team_id", input.teamId)
      .eq("vers", 0)
      .eq("del_yn", false);
    if (input.memId) q = q.eq("mem_id", input.memId);
    return q.order("crt_at", { ascending: false }).order("cpn_id");
  });
  const views = rows.map((r) => toCouponView(r, input.today));
  return input.status ? views.filter((v) => v.status === input.status) : views;
}

// ─────────────────────────────── 사용·취소 ───────────────────────────────

/** 사용 처리 — 사용일(기본 오늘 KST)과 메모만 남긴다. 이미 사용했거나 기한이 지난 쿠폰은 막는다. */
export async function redeemCouponCore(
  db: Db,
  input: { teamId: string; usedByMemId: string; cpnId: string; usedDt?: string; memo?: string | null },
): Promise<CouponResult> {
  const parsed = couponUseSchema.safeParse({ cpnId: input.cpnId, usedDt: input.usedDt, memo: input.memo });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "입력이 올바르지 않아요." };

  const { data: row } = await db
    .from("cpn_mst")
    .select("cpn_id, used_yn, exp_dt")
    .eq("cpn_id", input.cpnId)
    .eq("team_id", input.teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (!row) return { ok: false, message: "쿠폰을 찾을 수 없어요." };
  if (row.used_yn) return { ok: false, message: "이미 사용 처리된 쿠폰이에요." };
  const usedDt = parsed.data.usedDt ?? todayKST();
  if (row.exp_dt && row.exp_dt < usedDt) return { ok: false, message: "유효기간이 지난 쿠폰이에요." };

  const { data, error } = await db
    .from("cpn_mst")
    .update({
      used_yn: true,
      used_dt: usedDt,
      used_memo_txt: parsed.data.memo?.trim() || null,
      used_by_mem_id: input.usedByMemId,
    })
    .eq("cpn_id", input.cpnId)
    .eq("team_id", input.teamId)
    .eq("used_yn", false) // 동시에 두 번 눌러도 한 번만
    .select("cpn_id");
  if (error) return { ok: false, message: "사용 처리에 실패했어요." };
  if (!data || data.length === 0) return { ok: false, message: "이미 사용 처리된 쿠폰이에요." };
  return { ok: true };
}

/** 사용 처리 되돌리기(잘못 눌렀을 때) */
export async function unredeemCouponCore(db: Db, input: { teamId: string; cpnId: string }): Promise<CouponResult> {
  const { data, error } = await db
    .from("cpn_mst")
    .update({ used_yn: false, used_dt: null, used_memo_txt: null, used_by_mem_id: null })
    .eq("cpn_id", input.cpnId)
    .eq("team_id", input.teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("used_yn", true)
    .select("cpn_id");
  if (error) return { ok: false, message: "사용 처리를 되돌리지 못했어요." };
  if (!data || data.length === 0) return { ok: false, message: "사용 처리된 쿠폰을 찾을 수 없어요." };
  return { ok: true };
}

/** 발급 취소 — 소프트 삭제라 회원에게도 안 보인다. 사용한 쿠폰은 먼저 사용 처리를 되돌려야 한다. */
export async function cancelCouponCore(db: Db, input: { teamId: string; cpnId: string }): Promise<CouponResult> {
  const { data: row } = await db
    .from("cpn_mst")
    .select("cpn_id, used_yn")
    .eq("cpn_id", input.cpnId)
    .eq("team_id", input.teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (!row) return { ok: false, message: "쿠폰을 찾을 수 없어요." };
  if (row.used_yn) return { ok: false, message: "사용한 쿠폰은 사용 처리를 먼저 되돌려 주세요." };

  const { error } = await db
    .from("cpn_mst")
    .update({ del_yn: true })
    .eq("cpn_id", input.cpnId)
    .eq("team_id", input.teamId)
    .eq("used_yn", false);
  if (error) return { ok: false, message: "쿠폰 취소에 실패했어요." };
  return { ok: true };
}
