import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";

import { FakeSupabase, type Row } from "./fake-supabase";

/**
 * 운영 MCP 회비 도구(#702) 검증.
 *
 * 확정·업로드 코어는 **진짜**를 돌리고(인메모리 Supabase), 잔액 재계산(RPC 의존)과 확정 취소(원장 앵커 조회 의존)만
 * 대체한다 — 그 둘은 앱 액션 쪽 테스트가 지키는 영역이고, 여기서 보는 건 "MCP 가 어떤 입력을 코어에 넘기고
 * 무엇을 막는가"다.
 */

const { recalcMock, cancelMock } = vi.hoisted(() => ({
  recalcMock: vi.fn(async (_db: unknown, input: { memIds?: string[] }) => ({
    ok: true as const,
    message: null,
    updatedCount: input.memIds?.length ?? 0,
  })),
  cancelMock: vi.fn(async (_db: unknown, input: { txnId: string; dryRun?: boolean }) => ({
    ok: true as const,
    message: null,
    memId: null as string | null,
    txnId: input.txnId,
  })),
}));
vi.mock("@/lib/dues/recalc-core", () => ({ recalculateBalanceCore: recalcMock }));
vi.mock("@/lib/dues/cancel-core", () => ({ cancelTransactionCore: cancelMock }));

import {
  cancelDuesTxn,
  confirmDuesTxns,
  getDuesBalances,
  listDuesInbox,
  reclassifyDuesTxn,
  uploadDuesXlsx,
} from "@/lib/mcp/dues";

const TEAM = "22222222-2222-4222-8222-222222222222";
const ADMIN = "11111111-1111-4111-8111-111111111111";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const M2 = "aaaaaaaa-0000-4000-8000-000000000002";
const PRJ = "dddddddd-0000-4000-8000-000000000001";

const T_AUTO = "eeeeeeee-0000-4000-8000-000000000001"; // 홍길동 4000원 → 자동
const T_ODD = "eeeeeeee-0000-4000-8000-000000000002"; // 홍길동 3500원 → 월회비 단위 아님
const T_REVIEW = "eeeeeeee-0000-4000-8000-000000000003"; // 미매칭 입금
const T_OUT = "eeeeeeee-0000-4000-8000-000000000004"; // 출금
const T_DONE = "eeeeeeee-0000-4000-8000-000000000005"; // 이미 확정(회비, M1)

const admin = (o: Partial<OperatorContext> = {}): OperatorContext => ({
  mem_id: ADMIN,
  team_id: TEAM,
  is_admin: true,
  mem_nm: "관리자",
  ...o,
});

function txn(id: string, over: Row): Row {
  return {
    txn_id: id,
    team_id: TEAM,
    txn_dt: "2026-11-10",
    txn_tm: "10:00:00",
    txn_amt: 4000,
    txn_io_enm: "deposit",
    raw_name: "홍길동",
    raw_memo: null,
    mem_id: null,
    match_st_cd: "unmatched",
    fee_item_cd: "due",
    project_id: null,
    is_cfm_yn: false,
    del_yn: false,
    ...over,
  };
}

function seed(extra: Record<string, Row[]> = {}) {
  const code = (cd: string) => ({
    cd,
    cd_nm: cd,
    sort_ord: 1,
    team_id: null,
    vers: 0,
    del_yn: false,
    cmm_cd_grp_mst: { cd_grp_cd: "FEE_ITEM_CD" },
  });
  return new FakeSupabase({
    team_mem_rel: [
      { mem_id: M1, team_id: TEAM, vers: 0, del_yn: false, mem_st_cd: "active" },
      { mem_id: M2, team_id: TEAM, vers: 0, del_yn: false, mem_st_cd: "active" },
    ],
    mem_mst: [
      { mem_id: M1, mem_nm: "홍길동", birth_dt: "1990-01-01", vers: 0, del_yn: false },
      { mem_id: M2, mem_nm: "김철수", birth_dt: "1991-02-02", vers: 0, del_yn: false },
    ],
    fee_payer_alias: [],
    fee_mem_bal_snap: [],
    fee_policy_cfg: [{ team_id: TEAM, vers: 0, del_yn: false, monthly_fee_amt: 2000, aply_stt_dt: "2026-01-01" }],
    cmm_cd_mst: ["due", "event_fee", "expense", "other"].map(code),
    evt_team_mst: [],
    evt_pb_cfg: [],
    evt_pb_prt_rel: [],
    fee_prj_mst: [{ prj_id: PRJ, prj_nm: "겨울 프로젝트", team_id: TEAM, st_cd: "active", vers: 0, del_yn: false, crt_at: "2026-11-01" }],
    fee_txn_hist: [
      txn(T_AUTO, { mem_id: M1, match_st_cd: "matched" }),
      txn(T_ODD, { mem_id: M1, match_st_cd: "matched", txn_amt: 3500 }),
      txn(T_REVIEW, { raw_name: "미지의입금자" }),
      txn(T_OUT, { txn_io_enm: "withdrawal", fee_item_cd: "expense", raw_name: "문구점", txn_amt: 12000 }),
      txn(T_DONE, { mem_id: M1, match_st_cd: "matched", is_cfm_yn: true }),
    ],
    fee_due_pay_hist: [],
    fee_xlsx_upd_hist: [],
    mcp_audit_log: [],
    ...extra,
  });
}

let db: FakeSupabase;
const client = () => db.asClient();

beforeEach(() => {
  recalcMock.mockClear();
  cancelMock.mockClear();
  db = seed();
});

describe("권한", () => {
  it("비-admin 은 모든 회비 도구에서 거부되고 DB 를 건드리지 않는다", async () => {
    const ctx = admin({ is_admin: false });
    await expect(uploadDuesXlsx(client(), ctx, { fileName: "a.xlsx", rows: [] })).rejects.toBeInstanceOf(ToolDeniedError);
    await expect(listDuesInbox(client(), ctx)).rejects.toBeInstanceOf(ToolDeniedError);
    await expect(confirmDuesTxns(client(), ctx, { auto: true })).rejects.toBeInstanceOf(ToolDeniedError);
    await expect(cancelDuesTxn(client(), ctx, { txnId: T_DONE })).rejects.toBeInstanceOf(ToolDeniedError);
    await expect(
      reclassifyDuesTxn(client(), ctx, { txnId: T_DONE, feeItemCd: "other" }),
    ).rejects.toBeInstanceOf(ToolDeniedError);
    await expect(getDuesBalances(client(), ctx)).rejects.toBeInstanceOf(ToolDeniedError);
    expect(db.ops).toHaveLength(0);
  });
});

describe("upload_dues_xlsx", () => {
  const rows = [
    { txn_dt: "2026-11-11", txn_tm: "09:00:00", amount: 4000, io: "deposit" as const, name: "홍길동" },
    { txn_dt: "2026-11-11", txn_tm: "09:10:00", amount: 5000, io: "deposit" as const, name: "누군지모름" },
    { txn_dt: "2026-11-11", txn_tm: "09:20:00", amount: 7000, io: "withdrawal" as const, name: "문구점" },
  ];

  it("xlsx_base64 와 rows 를 둘 다 주거나 둘 다 안 주면 거부한다", async () => {
    await expect(uploadDuesXlsx(client(), admin(), { fileName: "a", xlsxBase64: "AAAA", rows })).rejects.toBeInstanceOf(
      ToolInputError,
    );
    await expect(uploadDuesXlsx(client(), admin(), { fileName: "a" })).rejects.toBeInstanceOf(ToolInputError);
  });

  it("dry_run 은 요약만 계산하고 아무것도 적재하지 않는다", async () => {
    const r = await uploadDuesXlsx(client(), admin(), { fileName: "a", rows, dryRun: true });
    expect(r.dry_run).toBe(true);
    expect(r.summary).toMatchObject({ total: 3, autoDone: 1, needsReview: 1, excluded: 1, skipped: 0 });
    expect(r.audit_id).toBeNull();
    expect(db.opsOn("fee_xlsx_upd_hist", "insert")).toHaveLength(0);
    expect(db.opsOn("fee_txn_hist", "insert")).toHaveLength(0);
    expect(db.opsOn("mcp_audit_log", "insert")).toHaveLength(0);
  });

  it("dry_run 은 이미 적재된 거래(같은 유니크 키)를 중복으로 센다", async () => {
    const dup = [{ txn_dt: "2026-11-10", txn_tm: "10:00:00", amount: 4000, io: "deposit" as const, name: "홍길동" }];
    const r = await uploadDuesXlsx(client(), admin(), { fileName: "a", rows: dup, dryRun: true });
    expect(r.summary).toMatchObject({ total: 1, autoDone: 0, skipped: 1 });
  });

  it("실제 적재는 미확정으로만 넣고 감사행에 이름·금액을 싣지 않으며, 같은 행 묶음 재업로드는 막는다", async () => {
    const r = await uploadDuesXlsx(client(), admin(), { fileName: "a", rows });
    expect(r.summary).toMatchObject({ total: 3, autoDone: 1, needsReview: 1, excluded: 1 });
    const inserted = db.opsOn("fee_txn_hist", "insert").map((o) => o.payload as Row);
    expect(inserted).toHaveLength(3);
    expect(inserted.every((p) => p.is_cfm_yn === false)).toBe(true);

    const audit = db.opsOn("mcp_audit_log", "insert")[0].payload as Row;
    const dump = JSON.stringify(audit);
    expect(dump).not.toContain("홍길동");
    expect(dump).not.toContain("4000");

    await expect(uploadDuesXlsx(client(), admin(), { fileName: "a", rows })).rejects.toThrow("이미 처리된 파일");
  });

  it("행 검증: 날짜 형식·금액이 틀리면 거부한다", async () => {
    await expect(
      uploadDuesXlsx(client(), admin(), { fileName: "a", rows: [{ ...rows[0], txn_dt: "2026/11/11" }] }),
    ).rejects.toBeInstanceOf(ToolInputError);
    await expect(
      uploadDuesXlsx(client(), admin(), { fileName: "a", rows: [{ ...rows[0], amount: 0 }] }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("list_dues_inbox", () => {
  it("미확정만 3버킷으로 나누고, 월회비 단위가 아닌 이름 일치 입금은 확인필요(amount_hint)로 내린다", async () => {
    const r = await listDuesInbox(client(), admin());
    expect(r.counts).toEqual({ total: 4, auto: 1, needs_review: 2, excluded: 1 });
    const byId = new Map(r.items.map((i) => [i.txn_id, i]));
    expect(byId.get(T_AUTO)?.auto_eligible).toBe(true);
    expect(byId.get(T_AUTO)?.amount_hint).toBeNull();
    expect(byId.get(T_ODD)?.auto_eligible).toBe(false);
    expect(byId.get(T_ODD)?.bucket).toBe("needsReview");
    expect(byId.get(T_ODD)?.amount_hint).toContain("월회비 단위");
    expect(byId.has(T_DONE)).toBe(false);
    expect(byId.get(T_AUTO)?.mem_nm).toBe("홍길동");
    expect(r.projects).toEqual([{ prj_id: PRJ, name: "겨울 프로젝트" }]);
    expect(r.fee_items.map((f) => f.cd)).toContain("event_fee");
  });

  it("bucket 필터와 limit 을 적용한다", async () => {
    const r = await listDuesInbox(client(), admin(), { bucket: "needsReview" });
    expect(r.items.map((i) => i.txn_id).sort()).toEqual([T_ODD, T_REVIEW].sort());
    const r2 = await listDuesInbox(client(), admin(), { limit: 1 });
    expect(r2.returned).toBe(1);
    expect(r2.truncated).toBe(true);
  });
});

describe("confirm_dues_txns", () => {
  it("auto 는 자동 후보(이름 일치 + 월회비 배수)만 확정하고 확인필요·비배수는 건드리지 않는다", async () => {
    const r = await confirmDuesTxns(client(), admin(), { auto: true });
    expect(r.confirmed_txn_ids).toEqual([T_AUTO]);
    expect(r.confirmed).toBe(1);
    expect(r.balance_affecting).toBe(1);
    expect(db.tables.fee_txn_hist.find((t) => t.txn_id === T_AUTO)?.is_cfm_yn).toBe(true);
    expect(db.tables.fee_txn_hist.find((t) => t.txn_id === T_ODD)?.is_cfm_yn).toBe(false);
    expect(db.tables.fee_txn_hist.find((t) => t.txn_id === T_REVIEW)?.is_cfm_yn).toBe(false);
    expect(db.tables.fee_due_pay_hist).toHaveLength(1);
    expect(recalcMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ memIds: [M1] }));
    expect(r.audit_id).not.toBeNull();
  });

  it("진행 중 프로젝트 참가비와 같은 금액이면 월회비 배수여도 auto 에서 빠지고 프로젝트 힌트가 붙는다", async () => {
    const EVT = "ffffffff-0000-4000-8000-000000000001";
    db.tables.evt_team_mst = [{ evt_id: EVT, evt_nm: "동계 클래스", team_id: TEAM, evt_type_cd: "PB_CLASS", stts_enm: "ACTIVE" }];
    db.tables.evt_pb_cfg = [{ evt_id: EVT, deposit_amt: 30000, entry_fee_amt: 10000, mlg_dc_amt: 5000 }];
    db.tables.evt_pb_prt_rel = [{ prt_id: "p1", evt_id: EVT, mem_id: M1, deposit_amt: 30000, entry_fee_amt: 10000 }];
    // T_AUTO 금액을 참가비(40,000 = 월회비 2,000 의 배수)로 바꾼다
    const row = db.tables.fee_txn_hist.find((t) => t.txn_id === T_AUTO)!;
    row.txn_amt = 40000;
    const inbox = await listDuesInbox(client(), admin());
    const item = inbox.items.find((i) => i.txn_id === T_AUTO)!;
    expect(item.bucket).toBe("needsReview");
    expect(item.auto_eligible).toBe(false);
    expect(item.amount_hint).toContain("동계 클래스");
    expect(item.amount_hint).toContain("등록자예요");
    const r = await confirmDuesTxns(client(), admin(), { auto: true });
    expect(r.confirmed_txn_ids).toEqual([]);
    expect(db.tables.fee_txn_hist.find((t) => t.txn_id === T_AUTO)?.is_cfm_yn).toBe(false);
  });

  it("확인필요 건은 fee_item_cd 를 명시해야만 확정된다", async () => {
    const r = await confirmDuesTxns(client(), admin(), { items: [{ txn_id: T_REVIEW }] });
    expect(r.confirmed).toBe(0);
    expect(r.skipped[0].reason).toContain("확인필요");
    expect(db.tables.fee_txn_hist.find((t) => t.txn_id === T_REVIEW)?.is_cfm_yn).toBe(false);
  });

  it("회비로 확정하려면 회원이 있어야 하고, 지정하면 매칭이 승격되며 별칭을 기억할 수 있다", async () => {
    const no = await confirmDuesTxns(client(), admin(), { items: [{ txn_id: T_REVIEW, fee_item_cd: "due" }] });
    expect(no.skipped[0].reason).toContain("mem_id");

    db.tables.fee_payer_alias = [];
    const ok = await confirmDuesTxns(client(), admin(), {
      items: [{ txn_id: T_REVIEW, fee_item_cd: "due", mem_id: M2, remember_alias: true }],
    });
    expect(ok.confirmed).toBe(1);
    expect(ok.alias_learned).toBe(1);
    const row = db.tables.fee_txn_hist.find((t) => t.txn_id === T_REVIEW)!;
    expect(row).toMatchObject({ is_cfm_yn: true, mem_id: M2, match_st_cd: "matched", fee_item_cd: "due" });
    expect(db.tables.fee_due_pay_hist[0]).toMatchObject({ mem_id: M2, src_txn_id: T_REVIEW });
  });

  it("프로젝트 분류는 project_id 가 필요하고, 이 팀 프로젝트여야 한다", async () => {
    const miss = await confirmDuesTxns(client(), admin(), { items: [{ txn_id: T_REVIEW, fee_item_cd: "event_fee" }] });
    expect(miss.skipped[0].reason).toContain("project_id");

    // 잘못된 project_id 는 그 건만 건너뛰고 나머지 묶음은 진행한다(전체 거부 아님)
    const mixed = await confirmDuesTxns(client(), admin(), {
      items: [
        { txn_id: T_REVIEW, fee_item_cd: "event_fee", project_id: "ffffffff-0000-4000-8000-00000000dead", mem_id: M2 },
        { txn_id: T_AUTO },
      ],
    });
    expect(mixed.skipped).toEqual([{ txn_id: T_REVIEW, reason: "존재하지 않는 프로젝트입니다." }]);
    expect(mixed.confirmed_txn_ids).toEqual([T_AUTO]);

    const ok = await confirmDuesTxns(client(), admin(), {
      items: [{ txn_id: T_REVIEW, fee_item_cd: "event_fee", project_id: PRJ, mem_id: M2 }],
    });
    expect(ok.confirmed).toBe(1);
    expect(db.tables.fee_txn_hist.find((t) => t.txn_id === T_REVIEW)).toMatchObject({ project_id: PRJ, fee_item_cd: "event_fee" });
    expect(db.tables.fee_due_pay_hist.filter((p) => p.src_txn_id === T_REVIEW)).toHaveLength(0);
  });

  it("방향 규칙: 출금은 회비로, 입금은 지출로 확정할 수 없다", async () => {
    const out = await confirmDuesTxns(client(), admin(), { items: [{ txn_id: T_OUT, fee_item_cd: "due", mem_id: M1 }] });
    expect(out.skipped[0].reason).toContain("출금");
    const inn = await confirmDuesTxns(client(), admin(), { items: [{ txn_id: T_REVIEW, fee_item_cd: "expense" }] });
    expect(inn.skipped[0].reason).toContain("입금");
  });

  it("이미 확정된 건·없는 건은 사유와 함께 건너뛰고 나머지는 진행한다", async () => {
    const r = await confirmDuesTxns(client(), admin(), {
      items: [{ txn_id: T_DONE }, { txn_id: "eeeeeeee-0000-4000-8000-0000000000ff" }, { txn_id: T_OUT }],
    });
    expect(r.confirmed).toBe(1);
    expect(r.skipped.map((s) => s.txn_id).sort()).toEqual([T_DONE, "eeeeeeee-0000-4000-8000-0000000000ff"].sort());
  });

  it("dry_run 은 확정될 건만 알려 주고 아무것도 쓰지 않는다", async () => {
    const r = await confirmDuesTxns(client(), admin(), { auto: true, dryRun: true });
    expect(r.dry_run).toBe(true);
    expect(r.confirmed_txn_ids).toEqual([T_AUTO]);
    expect(db.opsOn("fee_txn_hist", "update")).toHaveLength(0);
    expect(db.opsOn("fee_due_pay_hist", "insert")).toHaveLength(0);
    expect(db.opsOn("mcp_audit_log", "insert")).toHaveLength(0);
    expect(recalcMock).not.toHaveBeenCalled();
  });

  it("items 도 auto 도 없으면 거부한다", async () => {
    await expect(confirmDuesTxns(client(), admin(), {})).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("cancel_dues_txn / reclassify_dues_txn", () => {
  it("cancel 은 코어에 위임하고 dry_run 이면 쓰지 않는다", async () => {
    const dry = await cancelDuesTxn(client(), admin(), { txnId: T_DONE, dryRun: true });
    expect(dry).toMatchObject({ dry_run: true, cancelled: false });
    expect(cancelMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dryRun: true }));
    expect(db.opsOn("mcp_audit_log", "insert")).toHaveLength(0);

    const real = await cancelDuesTxn(client(), admin(), { txnId: T_DONE });
    expect(real.cancelled).toBe(true);
    expect(real.audit_id).not.toBeNull();
  });

  it("cancel 이 거부되면 사유를 입력 오류로 올린다", async () => {
    cancelMock.mockResolvedValueOnce({ ok: false, message: "취소할 수 없습니다." } as never);
    await expect(cancelDuesTxn(client(), admin(), { txnId: T_DONE })).rejects.toThrow("취소할 수 없습니다.");
  });

  it("reclassify dry_run 은 from→to 만 돌려주고 취소·확정을 실행하지 않는다", async () => {
    const r = await reclassifyDuesTxn(client(), admin(), { txnId: T_DONE, feeItemCd: "event_fee", projectId: PRJ, dryRun: true });
    expect(r.from).toMatchObject({ fee_item_cd: "due", mem_id: M1 });
    expect(r.to).toMatchObject({ fee_item_cd: "event_fee", project_id: PRJ });
    expect(cancelMock).toHaveBeenCalledTimes(1); // 사전 검증(dryRun)
    expect(cancelMock.mock.calls[0][1]).toMatchObject({ dryRun: true });
    expect(db.tables.fee_txn_hist.find((t) => t.txn_id === T_DONE)?.is_cfm_yn).toBe(true);
  });

  it("reclassify 는 취소 뒤 새 값으로 재확정하고 이전·새 회원 잔액을 다시 계산한다", async () => {
    cancelMock.mockImplementation(async (_db, input) => {
      // 코어가 하는 일을 흉내: 미확정으로 되돌림
      const row = db.tables.fee_txn_hist.find((t) => t.txn_id === input.txnId)!;
      if (!input.dryRun) row.is_cfm_yn = false;
      return { ok: true as const, message: null, memId: M1, txnId: input.txnId };
    });
    const r = await reclassifyDuesTxn(client(), admin(), { txnId: T_DONE, feeItemCd: "due", memId: M2 });
    expect(r.to).toMatchObject({ fee_item_cd: "due", mem_id: M2 });
    const row = db.tables.fee_txn_hist.find((t) => t.txn_id === T_DONE)!;
    expect(row).toMatchObject({ is_cfm_yn: true, mem_id: M2 });
    const memIds = (recalcMock.mock.calls.at(-1)![1] as { memIds: string[] }).memIds.sort();
    expect(memIds).toEqual([M1, M2].sort());
  });

  it("같은 값으로의 재분류·미확정 거래·잘못된 분류는 거부한다", async () => {
    await expect(reclassifyDuesTxn(client(), admin(), { txnId: T_DONE, feeItemCd: "due" })).rejects.toThrow("이미 같은");
    await expect(reclassifyDuesTxn(client(), admin(), { txnId: T_AUTO, feeItemCd: "other" })).rejects.toThrow("확정되지 않은");
    await expect(reclassifyDuesTxn(client(), admin(), { txnId: T_DONE, feeItemCd: "nope" })).rejects.toThrow("유효하지");
  });
});

describe("get_dues_balances", () => {
  it("미납이 큰 순으로 정렬하고 요약·개월 환산을 계산하며 동명이인에게만 생년월일을 싣는다", async () => {
    db = seed({
      mem_mst: [
        { mem_id: M1, mem_nm: "홍길동", birth_dt: "1990-01-01", vers: 0, del_yn: false },
        { mem_id: M2, mem_nm: "홍길동", birth_dt: "1991-02-02", vers: 0, del_yn: false },
      ],
      fee_mem_bal_snap: [
        { mem_id: M1, team_id: TEAM, vers: 0, del_yn: false, bal_amt: -6000, last_calc_dt: "2026-11-01", mem_mst: { mem_nm: "홍길동", birth_dt: "1990-01-01" } },
        { mem_id: M2, team_id: TEAM, vers: 0, del_yn: false, bal_amt: 4000, last_calc_dt: "2026-11-01", mem_mst: { mem_nm: "홍길동", birth_dt: "1991-02-02" } },
      ],
    });
    const r = await getDuesBalances(client(), admin());
    expect(r.members.map((m) => m.mem_id)).toEqual([M1, M2]);
    expect(r.members[0]).toMatchObject({ status: "미납", months: 3, birth_dt: "1990-01-01" });
    expect(r.summary).toMatchObject({ unpaid: 1, prepaid: 1, unpaid_total: -6000, prepaid_total: 4000 });

    const only = await getDuesBalances(client(), admin(), { status: "예치" });
    expect(only.members.map((m) => m.mem_id)).toEqual([M2]);
  });
});

describe("보강: 입력·정확도", () => {
  it("rows 경로는 txn_tm 이 필수다(빈 시각은 중복 방지 키가 안 걸린다)", async () => {
    const row = { txn_dt: "2026-11-11", amount: 4000, io: "deposit" as const, name: "홍길동" };
    await expect(
      uploadDuesXlsx(client(), admin(), { fileName: "a", rows: [row as never] }),
    ).rejects.toThrow("txn_tm");
    await expect(
      uploadDuesXlsx(client(), admin(), { fileName: "a", rows: [{ ...row, txn_tm: "9시" }] }),
    ).rejects.toThrow("txn_tm");
  });

  it("balance_affecting 은 납부원장이 실제로 만들어지는 건만 센다(매칭 안 된 저장 회원은 제외)", async () => {
    db = seed({
      fee_txn_hist: [
        txn(T_AUTO, { mem_id: M1, match_st_cd: "matched" }),
        // 회원 id 는 있으나 매칭 상태가 matched 가 아님 → 코어가 원장을 안 만든다
        txn(T_REVIEW, { mem_id: M2, match_st_cd: "ambiguous" }),
      ],
    });
    const r = await confirmDuesTxns(client(), admin(), {
      items: [{ txn_id: T_AUTO }, { txn_id: T_REVIEW, fee_item_cd: "due" }],
    });
    expect(r.skipped.map((s) => s.txn_id)).toEqual([T_REVIEW]);
    expect(r.balance_affecting).toBe(1);
    expect(db.tables.fee_due_pay_hist).toHaveLength(1);
  });
});

describe("보강: 업로드(base64 엑셀)", () => {
  async function xlsxBase64(rows: (string | number)[][]) {
    const XLSX = await import("xlsx");
    const filler = Array.from({ length: 9 }, () => ["x"]);
    const header = ["거래일시", "구분", "거래금액", "거래구분", "내용", "메모"];
    const ws = XLSX.utils.aoa_to_sheet([...filler, ["조회 정보"], header, ...rows] as never);
    // 헤더는 range:9 이후 둘째 줄(index 1) — 위에서 filler 9줄 + 안내 1줄 + 헤더
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "s");
    return (XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer).toString("base64");
  }

  it("엑셀을 읽어 dry_run 요약을 계산하고, 같은 파일을 두 번 올리면 두 번째는 거부한다", async () => {
    const b64 = await xlsxBase64([
      ["2026.11.11 09:00:00", "입금", "4,000", "체크카드", "홍길동", ""],
      ["2026.11.11 09:10:00", "출금", "7,000", "체크카드", "문구점", ""],
    ]);
    const dry = await uploadDuesXlsx(client(), admin(), { fileName: "a.xlsx", xlsxBase64: b64, dryRun: true });
    expect(dry.source).toBe("xlsx");
    expect(dry.summary).toMatchObject({ total: 2, autoDone: 1, excluded: 1 });
    expect(db.opsOn("fee_txn_hist", "insert")).toHaveLength(0);

    const real = await uploadDuesXlsx(client(), admin(), { fileName: "a.xlsx", xlsxBase64: b64 });
    expect(real.summary.total).toBe(2);
    expect(db.opsOn("fee_txn_hist", "insert")).toHaveLength(2);
    await expect(uploadDuesXlsx(client(), admin(), { fileName: "a.xlsx", xlsxBase64: b64 })).rejects.toThrow("이미 처리된 파일");
  });

  it("엑셀이 아닌 바이트는 파싱 실패로 거부한다", async () => {
    const junk = Buffer.from("not an excel file").toString("base64");
    await expect(uploadDuesXlsx(client(), admin(), { fileName: "a.xlsx", xlsxBase64: junk })).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("보강: 실패 경로", () => {
  it("확정 뒤 재계산이 실패해도 던지지 않고 상태·대기 회원과 감사행을 남긴다", async () => {
    recalcMock.mockResolvedValueOnce({ ok: false, message: "boom", updatedCount: 0 } as never);
    const r = await confirmDuesTxns(client(), admin(), { auto: true });
    expect(r.status).toBe("recalc_failed");
    expect(r.recalc_pending_mem_ids).toEqual([M1]);
    expect(r.confirmed).toBe(1);
    expect(r.audit_id).not.toBeNull();
    const audit = db.opsOn("mcp_audit_log", "insert")[0].payload as { params_json: { status: string; txn_ids: string[] } };
    expect(audit.params_json).toMatchObject({ status: "recalc_failed", txn_ids: [T_AUTO] });
  });

  it("취소는 됐는데 재계산만 실패하면 status=recalc_failed 로 알리고 감사를 남긴다", async () => {
    cancelMock.mockResolvedValueOnce({ ok: false, cancelled: true, memId: M1, message: "x" } as never);
    const r = await cancelDuesTxn(client(), admin(), { txnId: T_DONE });
    expect(r).toMatchObject({ cancelled: true, status: "recalc_failed", recalc_pending_mem_ids: [M1] });
    expect(r.audit_id).not.toBeNull();
  });

  function cancelFlips() {
    cancelMock.mockImplementation(async (_db, input) => {
      const row = db.tables.fee_txn_hist.find((t) => t.txn_id === input.txnId)!;
      if (!input.dryRun) row.is_cfm_yn = false;
      return { ok: true as const, message: null, memId: M1, txnId: input.txnId };
    });
  }

  it("재분류 중 취소 단계 재계산이 실패해도 끝까지 재확정하고 상태로 알린다", async () => {
    cancelMock.mockImplementation(async (_db, input) => {
      if (!(input as { dryRun?: boolean }).dryRun) db.tables.fee_txn_hist.find((t) => t.txn_id === input.txnId)!.is_cfm_yn = false;
      return (input as { dryRun?: boolean }).dryRun
        ? { ok: true as const, message: null, memId: M1, txnId: input.txnId }
        : ({ ok: false, cancelled: true, memId: M1, message: "recalc" } as never);
    });
    recalcMock.mockResolvedValueOnce({ ok: false, message: "boom" } as never);
    const r = await reclassifyDuesTxn(client(), admin(), { txnId: T_DONE, feeItemCd: "due", memId: M2 });
    expect(r.status).toBe("reclassified_recalc_failed");
    expect(r.recalc_pending_mem_ids.sort()).toEqual([M1, M2].sort());
    expect(db.tables.fee_txn_hist.find((t) => t.txn_id === T_DONE)).toMatchObject({ is_cfm_yn: true, mem_id: M2 });
    expect(r.audit_id).not.toBeNull();
  });

  it("새 값 재확정이 실패하면 원래 값으로 되돌려 확정하고 restored 로 알린다", async () => {
    cancelFlips();
    // 새 값 재확정의 첫 UPDATE 한 번만 DB 오류로 만든다(원복 확정은 정상 동작).
    let hits = 0;
    Object.defineProperty(db.errors, "fee_txn_hist:update", {
      configurable: true,
      get: () => (hits++ === 0 ? { message: "fail" } : undefined),
    });
    const r = await reclassifyDuesTxn(client(), admin(), { txnId: T_DONE, feeItemCd: "other" });
    expect(r.status).toBe("restored");
    expect(db.tables.fee_txn_hist.find((t) => t.txn_id === T_DONE)).toMatchObject({ is_cfm_yn: true, fee_item_cd: "due", mem_id: M1 });
    expect(r.audit_id).not.toBeNull();
  });
});
