import crypto from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cancelTransactionCore } from "@/lib/dues/cancel-core";
import { confirmTransactionsCore, type ConfirmItem } from "@/lib/dues/confirm-core";
import { duplicateNames } from "@/lib/dues/homonyms";
import { learnAliasesCore } from "@/lib/dues/learn-aliases-core";
import { matchPayer, type AliasRef, type MemberRef } from "@/lib/dues/match-payer";
import { recalculateBalanceCore } from "@/lib/dues/recalc-core";
import {
  hashBuffer,
  ingestDuesRows,
  inferItemCd,
  parseKakaoXlsx,
  type IngestSummary,
  type ParsedRow,
} from "@/lib/dues/upload-core";
import { bucketOf, type Bucket } from "@/lib/dues/upload-bucketize";
import { feeItemTeamFilter } from "@/lib/fee-items";
import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Database } from "@/lib/supabase/database.types";

import { getValidFeeItemCds } from "@/app/actions/dues/validate-fee-item";

/**
 * 기강 운영 MCP — 회비 거래내역 도구(#702).
 *
 * 앱의 「회비 > 처리」 화면이 하던 일(엑셀 업로드 → 확인필요 판단 → 확정 → 취소·재분류)을 에이전트가
 * 화면 조작 없이 하게 한다. 도메인 규칙은 앱과 **같은 코어**(`lib/dues/*-core.ts`)를 부른다 —
 * 중복 방지·baseline 컷오프·원장 생성·잔액 리플레이 재계산을 여기서 다시 쓰지 않는다.
 *
 * - 전부 **admin 전용**이다(회비 거래·잔액은 앱에서도 관리자에게만 보인다). 게이트는 이 모듈 안에 둔다.
 * - 쓰기 도구는 `dry_run` 을 지원한다 — 같은 검증을 돌리되 아무것도 쓰지 않는다.
 * - 감사행(`mcp_audit_log`)에는 **건수·거래 id 만** 남긴다. 입금자 이름·금액·메모는 싣지 않는다.
 * - 이 모듈은 `next/*` 를 모른다(캐시 무효화는 라우트 몫).
 */

type Db = SupabaseClient<Database>;

/** 한 번에 확정할 수 있는 거래 수 — 응답·롤백 범위를 사람이 훑을 수 있는 크기로 묶는다. */
export const MAX_CONFIRM_ITEMS = 200;
export const MAX_UPLOAD_ROWS = 3000;
/** base64 문자열 상한(약 7.5MB 원본) — 카카오뱅크 거래내역 한 달치는 수십 KB다. */
export const MAX_XLSX_BASE64_LENGTH = 10_000_000;

function requireAdmin(ctx: OperatorContext): void {
  if (!ctx.is_admin) throw new ToolDeniedError();
}

async function writeAudit(
  db: Db,
  ctx: OperatorContext,
  tool: string,
  params: Record<string, unknown>,
  summary: string,
): Promise<string | null> {
  const auditId = crypto.randomUUID();
  const { error } = await db.from("mcp_audit_log").insert({
    audit_id: auditId,
    actor_mem_id: ctx.mem_id,
    team_id: ctx.team_id,
    tool_nm: tool,
    params_json: params as Database["public"]["Tables"]["mcp_audit_log"]["Insert"]["params_json"],
    result_summary: summary,
  });
  if (error) {
    console.error(`[mcp] ${tool} 감사 기록 실패`, error.message);
    return null;
  }
  return auditId;
}

// ─────────────────────────────── 공용 조회 ───────────────────────────────

type TeamMatchContext = {
  memberRefs: MemberRef[];
  nameById: Map<string, string>;
  birthById: Map<string, string | null>;
  aliasRefs: AliasRef[];
};

/** 팀 회원·별칭 — 입금자명 매칭 후보 계산용 */
async function loadMatchContext(db: Db, teamId: string): Promise<TeamMatchContext> {
  const { data: rels, error: relsErr } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  if (relsErr) throw new Error(`팀 회원 조회 실패: ${relsErr.message}`);
  const memIds = (rels ?? []).map((r) => r.mem_id);

  const { data: mems, error: memsErr } = memIds.length
    ? await db.from("mem_mst").select("mem_id, mem_nm, birth_dt").in("mem_id", memIds).eq("vers", 0).eq("del_yn", false)
    : { data: [] as { mem_id: string; mem_nm: string; birth_dt: string | null }[], error: null };
  if (memsErr) throw new Error(`회원 조회 실패: ${memsErr.message}`);

  const { data: aliasRows, error: aliasErr } = await db
    .from("fee_payer_alias")
    .select("raw_name_norm, mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);
  if (aliasErr) throw new Error(`별칭 조회 실패: ${aliasErr.message}`);

  return {
    memberRefs: (mems ?? []).map((m) => ({ memId: m.mem_id, name: m.mem_nm })),
    nameById: new Map((mems ?? []).map((m) => [m.mem_id, m.mem_nm])),
    birthById: new Map((mems ?? []).map((m) => [m.mem_id, m.birth_dt])),
    aliasRefs: (aliasRows ?? []).map((a) => ({ rawNameNorm: a.raw_name_norm, memId: a.mem_id })),
  };
}

async function latestMonthlyFee(db: Db, teamId: string): Promise<number | null> {
  const { data, error } = await db
    .from("fee_policy_cfg")
    .select("monthly_fee_amt")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("aply_stt_dt", { ascending: false })
    .limit(1);
  if (error) throw new Error(`회비 정책 조회 실패: ${error.message}`);
  return data?.[0]?.monthly_fee_amt ?? null;
}

type TxnRow = {
  txn_id: string;
  txn_dt: string;
  txn_tm: string | null;
  txn_amt: number;
  txn_io_enm: string;
  raw_name: string;
  raw_memo: string | null;
  mem_id: string | null;
  match_st_cd: string | null;
  fee_item_cd: string | null;
  project_id: string | null;
  is_cfm_yn: boolean;
};

const TXN_COLS =
  "txn_id, txn_dt, txn_tm, txn_amt, txn_io_enm, raw_name, raw_memo, mem_id, match_st_cd, fee_item_cd, project_id, is_cfm_yn";

function bucketOfRow(t: TxnRow): Bucket {
  return bucketOf({
    io: t.txn_io_enm as "deposit" | "withdrawal",
    itemCd: t.fee_item_cd ?? "other",
    matchStatus: (t.match_st_cd ?? "unmatched") as "matched" | "unmatched" | "ambiguous",
  });
}

/**
 * 자동 확정 후보에서 뺄 금액인가 — 월회비 단위가 아닌 입금은 회비가 아닐 수 있다(프로젝트 참가비·기부 등).
 * 금액 힌트 규칙(#708 · PR #714)이 들어오기 전까지의 보수적 안전장치다: 이름이 맞아도 금액이 월회비의
 * 배수가 아니면 자동으로 확정하지 않고 확인필요로 둔다.
 */
function isMonthlyFeeUnit(amt: number, monthlyFee: number | null): boolean {
  if (!monthlyFee || monthlyFee <= 0) return false;
  return amt % monthlyFee === 0;
}

// ─────────────────────────────── upload_dues_xlsx ───────────────────────────────

export type UploadRowInput = {
  txn_dt: string;
  /** 거래 시각 HH:mm:ss — 필수. 비면 중복 방지 키가 안 걸려 같은 행이 두 번 들어갈 수 있다. */
  txn_tm: string;
  amount: number;
  io: "deposit" | "withdrawal";
  name: string;
  memo?: string | null;
  txn_tp?: string | null;
};

export type UploadDuesInput = {
  fileName: string;
  xlsxBase64?: string;
  rows?: UploadRowInput[];
  dryRun?: boolean;
};

export type UploadDuesResult = {
  dry_run: boolean;
  source: "xlsx" | "rows";
  summary: IngestSummary;
  audit_id: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}:\d{2}$/;

function rowsFromJson(rows: UploadRowInput[]): ParsedRow[] {
  return rows.map((r, i) => {
    if (!DATE_RE.test(r.txn_dt)) throw new ToolInputError(`rows[${i}].txn_dt 는 YYYY-MM-DD 여야 합니다.`);
    if (typeof r.txn_tm !== "string" || !TIME_RE.test(r.txn_tm)) throw new ToolInputError(`rows[${i}].txn_tm 는 HH:mm:ss 여야 합니다(필수 — 중복 방지 키).`);
    if (!Number.isInteger(r.amount) || r.amount <= 0) throw new ToolInputError(`rows[${i}].amount 는 양의 정수여야 합니다.`);
    const name = r.name.trim();
    if (!name) throw new ToolInputError(`rows[${i}].name 이 비었습니다.`);
    const tp = (r.txn_tp ?? "").trim();
    return {
      txn_dt: r.txn_dt,
      txn_tm: r.txn_tm,
      txn_amt: r.amount,
      txn_io_enm: r.io,
      raw_name: name,
      raw_memo: r.memo?.trim() || null,
      txn_tp_txt: tp,
      fee_item_cd: inferItemCd(r.io, tp),
    };
  });
}

/**
 * `upload_dues_xlsx` — 거래내역을 미확정 거래로 적재한다(확정은 하지 않는다).
 * 같은 파일(해시)을 두 번 올려도, 이미 적재된 거래가 섞여 있어도 중복 적재되지 않는다(앱 업로드와 같은 규칙).
 */
export async function uploadDuesXlsx(db: Db, ctx: OperatorContext, input: UploadDuesInput): Promise<UploadDuesResult> {
  requireAdmin(ctx);

  const hasXlsx = Boolean(input.xlsxBase64);
  const hasRows = Boolean(input.rows?.length);
  if (hasXlsx === hasRows) throw new ToolInputError("xlsx_base64 와 rows 중 정확히 하나만 보내세요.");

  let rows: ParsedRow[];
  let fileHash: string;
  if (hasXlsx) {
    const b64 = input.xlsxBase64!;
    if (b64.length > MAX_XLSX_BASE64_LENGTH) throw new ToolInputError("파일이 너무 큽니다.");
    const buffer = Buffer.from(b64, "base64");
    if (buffer.length === 0) throw new ToolInputError("xlsx_base64 를 해석하지 못했습니다.");
    try {
      rows = await parseKakaoXlsx(buffer);
    } catch {
      throw new ToolInputError("파일 파싱에 실패했습니다. 카카오뱅크 거래내역 엑셀(복호화된 파일)인지 확인하세요.");
    }
    fileHash = hashBuffer(buffer);
  } else {
    if (input.rows!.length > MAX_UPLOAD_ROWS) throw new ToolInputError(`rows 는 최대 ${MAX_UPLOAD_ROWS}건입니다.`);
    rows = rowsFromJson(input.rows!);
    // 행 내용으로 해시를 만든다 — 같은 행 묶음을 다시 보내면 파일 중복으로 막힌다.
    fileHash = crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  }

  if (rows.length === 0) throw new ToolInputError("적재할 거래 행이 없습니다.");

  const dryRun = input.dryRun ?? false;
  const result = await ingestDuesRows(db, {
    teamId: ctx.team_id,
    actorMemId: ctx.mem_id,
    fileName: input.fileName,
    fileHash,
    rows,
    dryRun,
  });
  if (!result.ok) throw new ToolInputError(result.message);

  let auditId: string | null = null;
  if (!dryRun) {
    const s = result.summary;
    auditId = await writeAudit(
      db,
      ctx,
      "upload_dues_xlsx",
      { source: hasXlsx ? "xlsx" : "rows", total: s.total, auto: s.autoDone, review: s.needsReview, excluded: s.excluded, skipped: s.skipped, skipped_cutoff: s.skippedByCutoff },
      `upload_dues_xlsx ok: total=${s.total} new=${s.autoDone + s.needsReview + s.excluded}`,
    );
  }

  return { dry_run: dryRun, source: hasXlsx ? "xlsx" : "rows", summary: result.summary, audit_id: auditId };
}

// ─────────────────────────────── list_dues_inbox ───────────────────────────────

export const INBOX_DEFAULT_LIMIT = 100;
export const INBOX_MAX_LIMIT = 500;

export type InboxItem = {
  txn_id: string;
  txn_dt: string;
  txn_tm: string | null;
  amount: number;
  io: "deposit" | "withdrawal";
  raw_name: string;
  memo: string | null;
  fee_item_cd: string | null;
  match_status: string | null;
  mem_id: string | null;
  mem_nm: string | null;
  project_id: string | null;
  bucket: Bucket;
  /** 자동 확정 후보인가(`confirm_dues_txns` 의 auto 가 집는 건) */
  auto_eligible: boolean;
  candidates: { mem_id: string; name: string; score: number; birth_dt: string | null }[];
};

export type InboxResult = {
  counts: { total: number; auto: number; needs_review: number; excluded: number };
  monthly_fee_amt: number | null;
  returned: number;
  truncated: boolean;
  items: InboxItem[];
  fee_items: { cd: string; label: string }[];
  projects: { prj_id: string; name: string }[];
};

async function loadFeeItems(db: Db, teamId: string) {
  const { data, error } = await db
    .from("cmm_cd_mst")
    .select("cd, cd_nm, sort_ord, cmm_cd_grp_mst!inner(cd_grp_cd)")
    .eq("cmm_cd_grp_mst.cd_grp_cd", "FEE_ITEM_CD")
    .or(feeItemTeamFilter(teamId))
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("sort_ord", { ascending: true });
  if (error) throw new Error(`분류 코드 조회 실패: ${error.message}`);
  return (data ?? []).map((c) => ({ cd: c.cd, label: c.cd_nm }));
}

async function loadActiveProjects(db: Db, teamId: string) {
  const { data, error } = await db
    .from("fee_prj_mst")
    .select("prj_id, prj_nm")
    .eq("team_id", teamId)
    .eq("st_cd", "active")
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("crt_at", { ascending: false });
  if (error) throw new Error(`프로젝트 조회 실패: ${error.message}`);
  return (data ?? []).map((p) => ({ prj_id: p.prj_id, name: p.prj_nm }));
}

async function loadUnconfirmed(db: Db, teamId: string): Promise<TxnRow[]> {
  return fetchAllRows<TxnRow>(
    () =>
      db
        .from("fee_txn_hist")
        .select(TXN_COLS)
        .eq("team_id", teamId)
        .eq("is_cfm_yn", false)
        .eq("del_yn", false)
        .order("txn_dt", { ascending: true })
        .order("txn_id", { ascending: true }) as never,
    { label: "mcp-dues-inbox" },
  );
}

/**
 * `list_dues_inbox` — 처리 대기(미확정) 거래 목록. 앱 「처리」 화면과 같은 3버킷(자동·확인필요·제외)으로 나눈다.
 * 확인필요 건에는 후보 회원이, 응답 머리에는 확정에 쓸 분류 코드·모금 중 프로젝트가 같이 실린다.
 */
export async function listDuesInbox(
  db: Db,
  ctx: OperatorContext,
  input: { bucket?: Bucket; limit?: number } = {},
): Promise<InboxResult> {
  requireAdmin(ctx);
  const limit = Math.min(input.limit ?? INBOX_DEFAULT_LIMIT, INBOX_MAX_LIMIT);

  const [rows, mctx, monthly, feeItems, projects] = await Promise.all([
    loadUnconfirmed(db, ctx.team_id),
    loadMatchContext(db, ctx.team_id),
    latestMonthlyFee(db, ctx.team_id),
    loadFeeItems(db, ctx.team_id),
    loadActiveProjects(db, ctx.team_id),
  ]);

  const dup = duplicateNames(mctx.memberRefs);
  const counts = { total: rows.length, auto: 0, needs_review: 0, excluded: 0 };

  const all: InboxItem[] = rows.map((r) => {
    const bucket = bucketOfRow(r);
    const match = matchPayer(r.raw_name, mctx.memberRefs, mctx.aliasRefs);
    if (bucket === "autoDone") counts.auto++;
    else if (bucket === "needsReview") counts.needs_review++;
    else counts.excluded++;
    return {
      txn_id: r.txn_id,
      txn_dt: r.txn_dt,
      txn_tm: r.txn_tm,
      amount: r.txn_amt,
      io: r.txn_io_enm as "deposit" | "withdrawal",
      raw_name: r.raw_name,
      memo: r.raw_memo,
      fee_item_cd: r.fee_item_cd,
      match_status: r.match_st_cd,
      mem_id: r.mem_id,
      mem_nm: r.mem_id ? (mctx.nameById.get(r.mem_id) ?? null) : null,
      project_id: r.project_id,
      bucket,
      auto_eligible: bucket === "autoDone" && isMonthlyFeeUnit(r.txn_amt, monthly),
      // 후보는 확인필요 건에만 — 나머지는 이미 정해졌다. 생년월일은 동명이인 구분에만 쓴다.
      candidates:
        bucket === "needsReview"
          ? match.candidates.slice(0, 5).map((c) => ({
              mem_id: c.memId,
              name: c.name,
              score: c.score,
              birth_dt: dup.has(c.name) ? (mctx.birthById.get(c.memId) ?? null) : null,
            }))
          : [],
    };
  });

  const filtered = input.bucket ? all.filter((i) => i.bucket === input.bucket) : all;
  const items = filtered.slice(0, limit);

  return {
    counts,
    monthly_fee_amt: monthly,
    returned: items.length,
    truncated: filtered.length > items.length,
    items,
    fee_items: feeItems,
    projects,
  };
}

// ─────────────────────────────── confirm_dues_txns ───────────────────────────────

export type ConfirmDuesItemInput = {
  txn_id: string;
  fee_item_cd?: string;
  mem_id?: string | null;
  project_id?: string | null;
  /** 회비 + 회원 지정 건이면 입금자명을 별칭으로 기억(다음 업로드부터 자동 매칭) */
  remember_alias?: boolean;
};

export type ConfirmDuesInput = {
  items?: ConfirmDuesItemInput[];
  /** true 면 「자동」 버킷(이름이 정확히 한 회원에게 맞고 금액이 월회비 단위인 회비 입금) 전부를 더해 확정 */
  auto?: boolean;
  dryRun?: boolean;
};

export type ConfirmDuesResult = {
  dry_run: boolean;
  confirmed: number;
  skipped: { txn_id: string; reason: string }[];
  /** 확정으로 개인 잔액이 바뀌는(회비 + 회원) 건수 */
  balance_affecting: number;
  recalculated_members: number;
  alias_learned: number;
  audit_id: string | null;
  confirmed_txn_ids: string[];
  /** ok = 끝. recalc_failed = 확정은 끝났으나 잔액 재계산 실패 — recalc_pending_mem_ids 회원의 잔액이 낡았다. */
  status: "ok" | "recalc_failed";
  recalc_pending_mem_ids: string[];
};

/** 이 팀의 (삭제 안 된) 프로젝트 id — 묶음 확정에서 잘못된 project_id 가 전체를 막지 않게 건별로 거른다. */
async function loadTeamProjectIds(db: Db, teamId: string): Promise<Set<string>> {
  const { data, error } = await db.from("fee_prj_mst").select("prj_id").eq("team_id", teamId).eq("del_yn", false);
  if (error) throw new Error(`프로젝트 조회 실패: ${error.message}`);
  return new Set((data ?? []).map((p) => p.prj_id));
}

/** 분류·방향 규칙 — 출금을 수입 분류로, 입금을 지출로 바꾸는 사고를 막는다(앱 일괄 재분류와 같은 경계). */
function directionIssue(io: string, feeItemCd: string): string | null {
  if (io === "withdrawal" && (feeItemCd === "due" || feeItemCd === "event_fee")) {
    return "출금은 회비·프로젝트 분류로 확정할 수 없습니다.";
  }
  if (io === "deposit" && feeItemCd === "expense") return "입금은 지출 분류로 확정할 수 없습니다.";
  return null;
}

type Planned = {
  item: ConfirmItem;
  rawName: string;
  remember: boolean;
  finalCd: string;
  finalMemId: string | null;
  /** 확정 시 납부원장이 만들어져 잔액이 바뀌는 회원(회비 + 매칭된 회원). 없으면 null. */
  payMemId: string | null;
};

/**
 * 거래 한 건의 결정(분류·회원·프로젝트)을 검증해 코어에 넘길 항목으로 만든다. 문제가 있으면 사유 문자열.
 * `explicitDecision` — 호출자가 분류를 직접 지정했는가(확인필요 건은 반드시 지정해야 한다).
 */
function planItem(
  t: TxnRow,
  req: ConfirmDuesItemInput,
  validCds: Set<string>,
  inTeamMemIds: Set<string> | null,
  validPrjIds: Set<string> | null = null,
): Planned | string {
  const bucket = bucketOfRow(t);
  const explicitDecision = req.fee_item_cd !== undefined;
  if (bucket === "needsReview" && !explicitDecision) {
    return "확인필요 건입니다 — fee_item_cd(회비 due·프로젝트 event_fee·제외 other 등)를 직접 지정해야 확정됩니다.";
  }
  const finalCd = req.fee_item_cd ?? t.fee_item_cd ?? "";
  if (!finalCd || !validCds.has(finalCd)) return "분류가 없거나 유효하지 않습니다.";
  const dirIssue = directionIssue(t.txn_io_enm, finalCd);
  if (dirIssue) return dirIssue;

  const finalMemId = req.mem_id !== undefined && req.mem_id !== null ? req.mem_id : t.mem_id;
  if (req.mem_id && inTeamMemIds && !inTeamMemIds.has(req.mem_id)) return "이 팀 회원이 아닙니다.";
  // 납부원장은 「회비 + 매칭됨 + 회원」일 때만 생긴다(코어 규칙) — 같은 조건으로 미리 판정한다.
  const payMemId = finalCd === "due" ? (req.mem_id ? req.mem_id : t.match_st_cd === "matched" ? t.mem_id : null) : null;
  if (finalCd === "due" && !payMemId) {
    return "회비로 확정하려면 mem_id(납부 회원)가 필요합니다 — 회원 없이 확정하면 개인 잔액에 반영되지 않습니다.";
  }
  const finalPrj = finalCd === "event_fee" ? (req.project_id !== undefined ? req.project_id : t.project_id) : null;
  if (finalCd === "event_fee" && !finalPrj) return "프로젝트로 확정하려면 project_id 가 필요합니다.";
  if (finalPrj && validPrjIds && !validPrjIds.has(finalPrj)) return "존재하지 않는 프로젝트입니다.";

  const item: ConfirmItem = { txnId: t.txn_id };
  if (req.fee_item_cd !== undefined) item.feeItemCd = req.fee_item_cd;
  if (req.mem_id !== undefined) item.memId = req.mem_id;
  if (req.project_id !== undefined) item.prjId = req.project_id;
  return { item, rawName: t.raw_name, remember: Boolean(req.remember_alias), finalCd, finalMemId: finalMemId ?? null, payMemId };
}

/**
 * `confirm_dues_txns` — 지정한 거래를 확정하고(회비+회원이면 납부원장 생성) 영향받은 회원 잔액을 다시 계산한다.
 *
 * - 확인필요 건은 `items` 에 id 와 분류를 명시해야만 확정된다. `auto` 는 자동 버킷만 집는다.
 * - 한 건이라도 검증을 못 넘으면 그 건만 `skipped` 에 사유와 함께 담고 나머지는 계속 진행한다.
 * - `dry_run` 이면 같은 검증을 돌려 무엇이 확정될지만 돌려준다.
 */
export async function confirmDuesTxns(db: Db, ctx: OperatorContext, input: ConfirmDuesInput): Promise<ConfirmDuesResult> {
  requireAdmin(ctx);
  const dryRun = input.dryRun ?? false;
  const explicit = input.items ?? [];
  if (explicit.length === 0 && !input.auto) throw new ToolInputError("items 를 주거나 auto=true 로 자동 건을 지정하세요.");
  if (explicit.length > MAX_CONFIRM_ITEMS) throw new ToolInputError(`items 는 최대 ${MAX_CONFIRM_ITEMS}건입니다.`);

  const skipped: ConfirmDuesResult["skipped"] = [];
  const requests = new Map<string, ConfirmDuesItemInput>();
  for (const it of explicit) {
    if (requests.has(it.txn_id)) throw new ToolInputError("같은 txn_id 가 items 에 두 번 들어 있습니다.");
    requests.set(it.txn_id, it);
  }

  // 대상 거래 로드(이 팀의 삭제 안 된 것만)
  const ids = [...requests.keys()];
  let rows: TxnRow[] = [];
  if (ids.length) {
    const { data, error } = await db.from("fee_txn_hist").select(TXN_COLS).eq("team_id", ctx.team_id).eq("del_yn", false).in("txn_id", ids);
    if (error) throw new Error(`거래 조회 실패: ${error.message}`);
    rows = (data ?? []) as TxnRow[];
  }
  const byId = new Map(rows.map((r) => [r.txn_id, r]));

  if (input.auto) {
    const monthly = await latestMonthlyFee(db, ctx.team_id);
    const unconfirmed = await loadUnconfirmed(db, ctx.team_id);
    for (const t of unconfirmed) {
      if (requests.has(t.txn_id)) continue;
      if (bucketOfRow(t) !== "autoDone" || !isMonthlyFeeUnit(t.txn_amt, monthly)) continue;
      if (requests.size >= MAX_CONFIRM_ITEMS) break;
      requests.set(t.txn_id, { txn_id: t.txn_id });
      byId.set(t.txn_id, t);
    }
  }

  const [validCds, mctx] = await Promise.all([getValidFeeItemCds(db, ctx.team_id), loadMatchContext(db, ctx.team_id)]);
  const inTeam = new Set(mctx.memberRefs.map((m) => m.memId));
  const validPrjIds = await loadTeamProjectIds(db, ctx.team_id);

  const planned: Planned[] = [];
  for (const [txnId, req] of requests) {
    const t = byId.get(txnId);
    if (!t) {
      skipped.push({ txn_id: txnId, reason: "거래를 찾을 수 없습니다." });
      continue;
    }
    if (t.is_cfm_yn) {
      skipped.push({ txn_id: txnId, reason: "이미 확정된 거래입니다(고치려면 reclassify_dues_txn)." });
      continue;
    }
    const p = planItem(t, req, validCds, inTeam, validPrjIds);
    if (typeof p === "string") skipped.push({ txn_id: txnId, reason: p });
    else planned.push(p);
  }

  const items = planned.map((p) => p.item);
  const core = await confirmTransactionsCore(db, {
    teamId: ctx.team_id,
    actorMemId: ctx.mem_id,
    items,
    dryRun,
  });
  if (!core.ok) throw new ToolInputError(core.message);

  const confirmedIds = new Set(core.confirmedTxnIds ?? []);
  const confirmedPlans = planned.filter((p) => confirmedIds.has(p.item.txnId));
  const balanceAffecting = confirmedPlans.filter((p) => p.payMemId).length;

  let recalculated = 0;
  let aliasLearned = 0;
  let auditId: string | null = null;
  let status: ConfirmDuesResult["status"] = "ok";
  let pendingMemIds: string[] = [];

  if (!dryRun && confirmedPlans.length > 0) {
    // 별칭 학습은 확정이 성공한 뒤에만(거부된 판단이 다음 업로드 규칙으로 남지 않게). 실패해도 확정은 유지.
    const aliasItems = confirmedPlans
      .filter((p) => p.remember && p.payMemId)
      .map((p) => ({ rawName: p.rawName, memId: p.payMemId! }));
    if (aliasItems.length) {
      const a = await learnAliasesCore(db, { teamId: ctx.team_id, actorMemId: ctx.mem_id, items: aliasItems });
      if (a.ok) aliasLearned = a.learned;
      else console.error("[mcp] confirm_dues_txns 별칭 학습 실패");
    }

    const memIds = [...new Set(confirmedPlans.filter((p) => p.payMemId).map((p) => p.payMemId!))];
    if (memIds.length) {
      const r = await recalculateBalanceCore(db, { teamId: ctx.team_id, actorMemId: ctx.mem_id, memIds });
      if (!r.ok) {
        // 확정은 끝났다 — 잔액만 낡은 상태. 리플레이라 다음 재계산에서 복구된다. 던지지 않고 상태로 알린다
        // (던지면 에이전트가 「아무것도 안 됐다」고 오해해 같은 건을 다시 시도한다).
        console.error("[mcp] confirm_dues_txns 재계산 실패");
        status = "recalc_failed";
        pendingMemIds = memIds;
      } else {
        recalculated = r.updatedCount;
      }
    }

    auditId = await writeAudit(
      db,
      ctx,
      "confirm_dues_txns",
      {
        txn_ids: confirmedPlans.map((p) => p.item.txnId),
        auto: Boolean(input.auto),
        skipped: skipped.length,
        status,
        recalc_pending_mem_ids: pendingMemIds,
      },
      `confirm_dues_txns ${status}: confirmed=${core.confirmed} recalculated=${recalculated}`,
    );
  }

  return {
    dry_run: dryRun,
    confirmed: dryRun ? confirmedPlans.length : core.confirmed,
    skipped,
    balance_affecting: balanceAffecting,
    recalculated_members: recalculated,
    alias_learned: aliasLearned,
    audit_id: auditId,
    confirmed_txn_ids: confirmedPlans.map((p) => p.item.txnId),
    status,
    recalc_pending_mem_ids: pendingMemIds,
  };
}

// ─────────────────────────────── cancel_dues_txn ───────────────────────────────

export type CancelDuesResult = {
  dry_run: boolean;
  txn_id: string;
  cancelled: boolean;
  audit_id: string | null;
  /** ok = 끝. recalc_failed = 취소는 됐으나 잔액 재계산 실패 — recalc_pending_mem_ids 회원 잔액이 낡았다. */
  status: "ok" | "recalc_failed";
  recalc_pending_mem_ids: string[];
};

/**
 * `cancel_dues_txn` — 확정된 거래 1건을 미확정으로 되돌린다(납부원장 취소 + 잔액 재계산). 되돌린 거래는 처리 대기로 돌아간다.
 * 원장 전환 이전 개시잔액에 녹아 있는 거래는 취소할 수 없다.
 */
export async function cancelDuesTxn(
  db: Db,
  ctx: OperatorContext,
  input: { txnId: string; dryRun?: boolean },
): Promise<CancelDuesResult> {
  requireAdmin(ctx);
  const dryRun = input.dryRun ?? false;
  const r = await cancelTransactionCore(db, {
    teamId: ctx.team_id,
    actorMemId: ctx.mem_id,
    txnId: input.txnId,
    dryRun,
  });
  // 취소는 끝났는데 재계산만 실패한 경우는 오류가 아니라 상태로 돌려준다(감사도 남긴다).
  const recalcFailed = !r.ok && "cancelled" in r && r.cancelled;
  if (!r.ok && !recalcFailed) throw new ToolInputError(r.message);
  const status: CancelDuesResult["status"] = recalcFailed ? "recalc_failed" : "ok";
  const pending = recalcFailed && r.memId ? [r.memId] : [];

  let auditId: string | null = null;
  if (!dryRun) {
    auditId = await writeAudit(
      db,
      ctx,
      "cancel_dues_txn",
      { txn_id: input.txnId, status, recalc_pending_mem_ids: pending },
      `cancel_dues_txn ${status}`,
    );
  }
  return {
    dry_run: dryRun,
    txn_id: input.txnId,
    cancelled: !dryRun,
    audit_id: auditId,
    status,
    recalc_pending_mem_ids: pending,
  };
}

// ─────────────────────────────── reclassify_dues_txn ───────────────────────────────

export type ReclassifyInput = {
  txnId: string;
  feeItemCd: string;
  memId?: string | null;
  projectId?: string | null;
  rememberAlias?: boolean;
  dryRun?: boolean;
};

export type ReclassifyResult = {
  dry_run: boolean;
  txn_id: string;
  from: { fee_item_cd: string | null; mem_id: string | null; project_id: string | null };
  to: { fee_item_cd: string; mem_id: string | null; project_id: string | null };
  recalculated_members: number;
  audit_id: string | null;
  /**
   * 끝난 단계가 어디까지인지:
   * - reclassified: 새 값으로 확정 완료, 잔액도 갱신.
   * - reclassified_recalc_failed: 새 값으로 확정 완료, 잔액 재계산만 실패(recalc_pending_mem_ids 가 낡음).
   * - restored: 새 값 확정에 실패해 원래 값으로 되돌려 확정함(거래는 원래대로).
   * - left_pending: 새 값 확정도 원복도 실패 — 거래가 처리 대기에 남았다(list_dues_inbox 로 확인).
   */
  status: "reclassified" | "reclassified_recalc_failed" | "restored" | "left_pending";
  /** restored·left_pending 일 때 실패 사유(도구용 한 줄) */
  detail: string | null;
  recalc_pending_mem_ids: string[];
};

/**
 * `reclassify_dues_txn` — 이미 확정된 거래의 분류·회원·프로젝트를 바꾼다(확정 취소 → 새 값으로 재확정).
 * 먼저 취소 가능 여부와 새 값을 둘 다 검증한 뒤에만 쓴다. 재확정이 실패하면 원래 값으로 되돌려 확정해 둔다.
 */
export async function reclassifyDuesTxn(db: Db, ctx: OperatorContext, input: ReclassifyInput): Promise<ReclassifyResult> {
  requireAdmin(ctx);
  const dryRun = input.dryRun ?? false;

  const { data, error } = await db
    .from("fee_txn_hist")
    .select(TXN_COLS)
    .eq("team_id", ctx.team_id)
    .eq("del_yn", false)
    .eq("txn_id", input.txnId)
    .maybeSingle();
  if (error) throw new Error(`거래 조회 실패: ${error.message}`);
  const t = data as TxnRow | null;
  if (!t) throw new ToolInputError("거래를 찾을 수 없습니다.");
  if (!t.is_cfm_yn) throw new ToolInputError("확정되지 않은 거래입니다 — confirm_dues_txns 로 분류를 지정해 확정하세요.");

  const [validCds, mctx] = await Promise.all([getValidFeeItemCds(db, ctx.team_id), loadMatchContext(db, ctx.team_id)]);
  const inTeam = new Set(mctx.memberRefs.map((m) => m.memId));
  // 재확정 값 검증은 「확인필요 건은 분류 명시」 규칙을 이미 만족한다(feeItemCd 필수 입력).
  const validPrjIds = await loadTeamProjectIds(db, ctx.team_id);
  const plan = planItem(
    t,
    { txn_id: t.txn_id, fee_item_cd: input.feeItemCd, mem_id: input.memId, project_id: input.projectId, remember_alias: input.rememberAlias },
    validCds,
    inTeam,
    validPrjIds,
  );
  if (typeof plan === "string") throw new ToolInputError(plan);

  const from = { fee_item_cd: t.fee_item_cd, mem_id: t.mem_id, project_id: t.project_id };
  const finalPrj = plan.finalCd === "event_fee" ? (input.projectId !== undefined ? input.projectId : t.project_id) : null;
  const to = { fee_item_cd: plan.finalCd, mem_id: plan.finalMemId, project_id: finalPrj ?? null };
  if (from.fee_item_cd === to.fee_item_cd && from.mem_id === to.mem_id && (from.project_id ?? null) === to.project_id) {
    throw new ToolInputError("이미 같은 분류·회원·프로젝트로 확정돼 있습니다.");
  }

  // 사전 검증(쓰기 없음): 취소 가능 + 새 값 확정 가능
  const preCancel = await cancelTransactionCore(db, { teamId: ctx.team_id, actorMemId: ctx.mem_id, txnId: t.txn_id, dryRun: true });
  if (!preCancel.ok) throw new ToolInputError(preCancel.message);
  const preConfirm = await confirmTransactionsCore(db, {
    teamId: ctx.team_id,
    actorMemId: ctx.mem_id,
    items: [plan.item],
    dryRun: true,
    treatConfirmedAsPending: true,
  });
  if (!preConfirm.ok) throw new ToolInputError(preConfirm.message);

  if (dryRun) {
    return {
      dry_run: true,
      txn_id: t.txn_id,
      from,
      to,
      recalculated_members: 0,
      audit_id: null,
      status: "reclassified",
      detail: null,
      recalc_pending_mem_ids: [],
    };
  }

  const actor = { teamId: ctx.team_id, actorMemId: ctx.mem_id };
  const cancel = await cancelTransactionCore(db, { ...actor, txnId: t.txn_id });
  // 취소 자체가 안 됐으면 아무것도 안 바뀐 것이다. 취소는 됐는데 재계산만 실패했으면(cancelled) 아래로 계속 진행한다 —
  // 여기서 던지면 거래가 처리 대기에 방치된다. 재계산은 마지막에 한 번 더 한다.
  const cancelRecalcFailed = !cancel.ok && "cancelled" in cancel && cancel.cancelled;
  if (!cancel.ok && !cancelRecalcFailed) throw new ToolInputError(cancel.message);

  const memIds = [
    ...new Set([from.mem_id, plan.payMemId, ...(plan.finalCd === "due" ? [plan.finalMemId] : [])].filter((v): v is string => Boolean(v))),
  ];
  const finish = async (
    status: ReclassifyResult["status"],
    detail: string | null,
    recalculated: number,
    pending: string[],
  ): Promise<ReclassifyResult> => {
    const auditId = await writeAudit(
      db,
      ctx,
      "reclassify_dues_txn",
      { txn_id: t.txn_id, from_cd: from.fee_item_cd, to_cd: to.fee_item_cd, status, recalc_pending_mem_ids: pending },
      `reclassify_dues_txn ${status}: ${from.fee_item_cd}->${to.fee_item_cd}`,
    );
    return { dry_run: false, txn_id: t.txn_id, from, to, recalculated_members: recalculated, audit_id: auditId, status, detail, recalc_pending_mem_ids: pending };
  };

  const confirm = await confirmTransactionsCore(db, { ...actor, items: [plan.item] });
  if (!confirm.ok || confirm.confirmed !== 1) {
    // 원래 값으로 되돌려 확정 — 처리 대기에 방치되지 않게
    const restoreItem: ConfirmItem = { txnId: t.txn_id };
    if (t.fee_item_cd) restoreItem.feeItemCd = t.fee_item_cd;
    if (t.mem_id) restoreItem.memId = t.mem_id;
    if (t.project_id) restoreItem.prjId = t.project_id;
    const restore = await confirmTransactionsCore(db, { ...actor, items: [restoreItem] });
    const restored = restore.ok && restore.confirmed === 1;
    const rr = await recalculateBalanceCore(db, { ...actor, memIds });
    const pending = rr.ok ? [] : memIds;
    return finish(
      restored ? "restored" : "left_pending",
      restored
        ? "new_value_confirm_failed: original value re-confirmed"
        : "new_value_confirm_failed and restore_failed: txn is unconfirmed (see list_dues_inbox)",
      rr.ok ? rr.updatedCount : 0,
      pending,
    );
  }

  if (plan.remember && plan.payMemId) {
    await learnAliasesCore(db, { ...actor, items: [{ rawName: plan.rawName, memId: plan.payMemId }] });
  }

  if (memIds.length === 0) return finish("reclassified", null, 0, []);
  const r = await recalculateBalanceCore(db, { ...actor, memIds });
  if (!r.ok) {
    console.error("[mcp] reclassify_dues_txn 재계산 실패");
    return finish("reclassified_recalc_failed", "reclassified but balance recalculation failed", 0, memIds);
  }
  return finish("reclassified", null, r.updatedCount, []);
}

// ─────────────────────────────── get_dues_balances ───────────────────────────────

export type BalanceStatus = "미납" | "정상" | "예치";

export type DuesBalancesResult = {
  monthly_fee_amt: number | null;
  summary: { unpaid: number; ok: number; prepaid: number; unpaid_total: number; prepaid_total: number };
  returned: number;
  truncated: boolean;
  members: {
    mem_id: string;
    name: string;
    birth_dt: string | null;
    balance: number;
    status: BalanceStatus;
    /** 한 달 회비 단위로 환산한 미납/예치 개월 수(내림) */
    months: number;
    last_calc_dt: string | null;
  }[];
};

export const BALANCES_DEFAULT_LIMIT = 200;

/**
 * `get_dues_balances` — 활성 회원의 회비 잔액(예치/미납) 현황. 잔액은 앱 원장과 같은 스냅샷이며
 * 음수가 미납, 양수가 예치다. 미납이 큰 순으로 정렬한다.
 */
export async function getDuesBalances(
  db: Db,
  ctx: OperatorContext,
  input: { status?: BalanceStatus; limit?: number } = {},
): Promise<DuesBalancesResult> {
  requireAdmin(ctx);
  const limit = input.limit ?? BALANCES_DEFAULT_LIMIT;
  const monthly = await latestMonthlyFee(db, ctx.team_id);

  const { data: activeRels, error: relErr } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", ctx.team_id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "active");
  if (relErr) throw new Error(`활성 회원 조회 실패: ${relErr.message}`);
  const activeIds = (activeRels ?? []).map((r) => r.mem_id);
  const empty = { unpaid: 0, ok: 0, prepaid: 0, unpaid_total: 0, prepaid_total: 0 };
  if (!activeIds.length) return { monthly_fee_amt: monthly, summary: empty, returned: 0, truncated: false, members: [] };

  const { data: snaps, error: snapErr } = await db
    .from("fee_mem_bal_snap")
    .select("mem_id, bal_amt, last_calc_dt, mem_mst!fk_fee_mem_bal_snap__mem_mst(mem_nm, birth_dt)")
    .eq("team_id", ctx.team_id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .in("mem_id", activeIds);
  if (snapErr) throw new Error(`잔액 스냅샷 조회 실패: ${snapErr.message}`);

  const raw = (snaps ?? []).map((s) => {
    const mem = Array.isArray(s.mem_mst) ? s.mem_mst[0] : (s.mem_mst as { mem_nm: string; birth_dt: string | null } | null);
    const bal = s.bal_amt;
    const status: BalanceStatus = bal < 0 ? "미납" : bal > 0 ? "예치" : "정상";
    return {
      mem_id: s.mem_id,
      name: mem?.mem_nm ?? "(이름없음)",
      birth_dt: mem?.birth_dt ?? null,
      balance: bal,
      status,
      months: monthly ? Math.floor(Math.abs(bal) / monthly) : 0,
      last_calc_dt: s.last_calc_dt ?? null,
    };
  });
  // 생년월일은 동명이인 구분에만 싣는다
  const dup = duplicateNames(raw.map((r) => ({ name: r.name })));
  const all = raw.map((r) => ({ ...r, birth_dt: dup.has(r.name) ? r.birth_dt : null })).sort((a, b) => a.balance - b.balance);

  const summary = {
    unpaid: all.filter((r) => r.status === "미납").length,
    ok: all.filter((r) => r.status === "정상").length,
    prepaid: all.filter((r) => r.status === "예치").length,
    unpaid_total: all.filter((r) => r.balance < 0).reduce((s, r) => s + r.balance, 0),
    prepaid_total: all.filter((r) => r.balance > 0).reduce((s, r) => s + r.balance, 0),
  };
  const filtered = input.status ? all.filter((r) => r.status === input.status) : all;
  const members = filtered.slice(0, limit);
  return { monthly_fee_amt: monthly, summary, returned: members.length, truncated: filtered.length > members.length, members };
}
