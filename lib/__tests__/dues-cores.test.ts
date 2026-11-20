import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase, type Row } from "@/app/api/mcp/__tests__/fake-supabase";

/**
 * 회비 코어(`lib/dues/*-core.ts`) — 서버 액션과 운영 MCP 가 공유하는 본체.
 * 재계산 코어는 진짜를, 취소 코어는 재계산만 대체해 돌린다.
 */

const { recalcMock } = vi.hoisted(() => ({
  recalcMock: vi.fn(async (_db: unknown, _input: unknown): Promise<{ ok: boolean; message: string | null; updatedCount?: number }> => ({
    ok: true,
    message: null,
    updatedCount: 1,
  })),
}));
vi.mock("@/lib/dues/recalc-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dues/recalc-core")>();
  return { ...actual, recalculateBalanceCore: recalcMock, __actual: actual.recalculateBalanceCore };
});

import { cancelTransactionCore } from "@/lib/dues/cancel-core";
import { confirmTransactionsCore } from "@/lib/dues/confirm-core";
import * as recalcModule from "@/lib/dues/recalc-core";

const TEAM = "22222222-2222-4222-8222-222222222222";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const TXN = "eeeeeeee-0000-4000-8000-000000000001";

/** `rpc()` 호출을 기록하고, `rpcError` 를 넣으면 그 오류를 돌려주는 인메모리 DB */
class RpcFake extends FakeSupabase {
  rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  rpcError: unknown = null;
  rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    return Promise.resolve({ data: null, error: this.rpcError });
  }
}

const asDb = (f: FakeSupabase) => f.asClient();

function confirmedTxn(over: Row = {}): Row {
  return {
    txn_id: TXN,
    team_id: TEAM,
    is_cfm_yn: true,
    fee_item_cd: "due",
    mem_id: M1,
    txn_dt: "2026-11-10",
    txn_tm: "10:00:00",
    del_yn: false,
    cfm_by_mem_id: ACTOR,
    cfm_at: "2026-11-11T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  recalcMock.mockClear();
  recalcMock.mockResolvedValue({ ok: true, message: null, updatedCount: 1 });
});

describe("cancelTransactionCore", () => {
  it("없는 거래·미확정 거래는 거부한다", async () => {
    const f = new FakeSupabase({ fee_txn_hist: [confirmedTxn({ is_cfm_yn: false })] });
    expect((await cancelTransactionCore(asDb(f), { teamId: TEAM, actorMemId: ACTOR, txnId: TXN })).ok).toBe(false);
    const g = new FakeSupabase({ fee_txn_hist: [] });
    expect((await cancelTransactionCore(asDb(g), { teamId: TEAM, actorMemId: ACTOR, txnId: TXN })).ok).toBe(false);
  });

  it("회비 거래 취소: 미확정으로 되돌리고 납부원장을 cancelled 로 바꾼 뒤 그 회원을 재계산한다", async () => {
    const f = new FakeSupabase({
      fee_txn_hist: [confirmedTxn()],
      fee_due_pay_hist: [{ team_id: TEAM, src_txn_id: TXN, pay_st_cd: "paid" }],
      fee_mem_bal_snap: [],
    });
    const r = await cancelTransactionCore(asDb(f), { teamId: TEAM, actorMemId: ACTOR, txnId: TXN });
    expect(r.ok).toBe(true);
    expect(f.tables.fee_txn_hist[0]).toMatchObject({ is_cfm_yn: false, cfm_by_mem_id: null, cfm_at: null });
    expect(f.tables.fee_due_pay_hist[0].pay_st_cd).toBe("cancelled");
    expect(recalcMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ memIds: [M1] }));
  });

  it("dryRun 은 검증만 하고 아무것도 쓰지 않는다", async () => {
    const f = new FakeSupabase({ fee_txn_hist: [confirmedTxn()], fee_due_pay_hist: [], fee_mem_bal_snap: [] });
    const r = await cancelTransactionCore(asDb(f), { teamId: TEAM, actorMemId: ACTOR, txnId: TXN, dryRun: true });
    expect(r.ok).toBe(true);
    expect(f.opsOn("fee_txn_hist", "update")).toHaveLength(0);
    expect(recalcMock).not.toHaveBeenCalled();
  });

  it("개시잔액(앵커)에 녹은 과거 거래는 취소를 거부한다", async () => {
    const f = new FakeSupabase({
      fee_txn_hist: [confirmedTxn({ txn_dt: "2026-03-01" })],
      fee_due_pay_hist: [],
      fee_mem_bal_snap: [
        { team_id: TEAM, mem_id: M1, del_yn: false, crt_at: "2026-01-01T00:00:00.000Z", last_calc_at: "2026-06-01T00:00:00.000Z" },
      ],
    });
    const r = await cancelTransactionCore(asDb(f), { teamId: TEAM, actorMemId: ACTOR, txnId: TXN });
    expect(r.ok).toBe(false);
    expect(f.tables.fee_txn_hist[0].is_cfm_yn).toBe(true);
  });

  it("재계산만 실패하면 ok:false 이되 cancelled:true 로 「이미 취소됨」을 알린다", async () => {
    recalcMock.mockResolvedValueOnce({ ok: false, message: "rpc 실패" });
    const f = new FakeSupabase({ fee_txn_hist: [confirmedTxn()], fee_due_pay_hist: [], fee_mem_bal_snap: [] });
    const r = await cancelTransactionCore(asDb(f), { teamId: TEAM, actorMemId: ACTOR, txnId: TXN });
    expect(r).toMatchObject({ ok: false, cancelled: true, memId: M1 });
    expect(f.tables.fee_txn_hist[0].is_cfm_yn).toBe(false);
  });
});

describe("recalculateBalanceCore", () => {
  // 모킹된 모듈에서 진짜 구현을 꺼낸다
  const actual = (recalcModule as unknown as { __actual: typeof recalcModule.recalculateBalanceCore }).__actual;

  function ledger(extra: Record<string, Row[]> = {}) {
    return new RpcFake({
      fee_policy_cfg: [
        { team_id: TEAM, vers: 0, del_yn: false, aply_stt_dt: "2026-01-01", aply_end_dt: "9999-12-31", monthly_fee_amt: 2000 },
      ],
      fee_mem_bal_snap: [],
      team_mem_rel: [
        { team_id: TEAM, mem_id: M1, vers: 0, del_yn: false, mem_st_cd: "active", join_dt: "2026-09-10", eff_at: "2026-09-10T00:00:00Z" },
      ],
      fee_due_pay_hist: [{ team_id: TEAM, mem_id: M1, pay_id: "p1", pay_amt: 4000, pay_dt: "2026-10-05", pay_st_cd: "paid", vers: 0, del_yn: false }],
      fee_due_exm_cfg: [],
      fee_due_exm_hist: [],
      fee_txn_hist: [],
      ...extra,
    });
  }

  it("회비 정책이 없으면 실패한다", async () => {
    const f = ledger({ fee_policy_cfg: [] });
    const r = await actual(asDb(f), { teamId: TEAM, actorMemId: ACTOR, memIds: [M1] });
    expect(r.ok).toBe(false);
    expect(f.rpcCalls).toHaveLength(0);
  });

  it("지정 회원의 납부 합계를 읽어 재계산 RPC 를 한 번 부른다", async () => {
    const f = ledger();
    const r = await actual(asDb(f), { teamId: TEAM, actorMemId: ACTOR, memIds: [M1] });
    expect(r).toMatchObject({ ok: true, updatedCount: 1 });
    expect(f.rpcCalls).toHaveLength(1);
    expect(f.rpcCalls[0].name).toBe("recalc_member_balance");
    expect(f.rpcCalls[0].args).toMatchObject({ p_team_id: TEAM, p_mem_id: M1, p_total_paid: 4000, p_base_bal: 0 });
  });

  it("취소된 납부(cancelled)는 합계에서 빠진다", async () => {
    const f = ledger({
      fee_due_pay_hist: [{ team_id: TEAM, mem_id: M1, pay_id: "p1", pay_amt: 4000, pay_dt: "2026-10-05", pay_st_cd: "cancelled", vers: 0, del_yn: false }],
    });
    await actual(asDb(f), { teamId: TEAM, actorMemId: ACTOR, memIds: [M1] });
    expect(f.rpcCalls[0].args).toMatchObject({ p_total_paid: 0 });
  });

  it("예치금 환급(확정 dep_refund 출금)은 그 회원 순납부에서 빠지고, 미확정·다른 회원 건은 안 센다(#710)", async () => {
    const refund = (over: Row = {}): Row => ({
      team_id: TEAM, mem_id: M1, fee_item_cd: "dep_refund", is_cfm_yn: true, del_yn: false,
      txn_amt: 1500, txn_dt: "2026-11-01", txn_tm: "09:00:00", ...over,
    });
    const f = ledger({
      fee_txn_hist: [refund(), refund({ txn_amt: 700, is_cfm_yn: false }), refund({ txn_amt: 900, mem_id: "other" })],
    });
    await actual(asDb(f), { teamId: TEAM, actorMemId: ACTOR, memIds: [M1] });
    expect(f.rpcCalls[0].args).toMatchObject({ p_total_paid: 4000 - 1500 });
  });

  it("RPC 가 실패하면 회원별 오류를 모아 ok:false 로 돌려준다", async () => {
    const f = ledger();
    f.rpcError = { message: "boom" };
    const r = await actual(asDb(f), { teamId: TEAM, actorMemId: ACTOR, memIds: [M1] });
    expect(r.ok).toBe(false);
    expect(r.message).toContain(M1);
  });
});

describe("confirmTransactionsCore — 분류·방향 검증(#710)", () => {
  const code = (cd: string) => ({
    cd, cd_nm: cd, sort_ord: 1, team_id: null, vers: 0, del_yn: false,
    cmm_cd_grp_mst: { cd_grp_cd: "FEE_ITEM_CD" },
  });
  const pending = (id: string, over: Row = {}): Row => ({
    txn_id: id, team_id: TEAM, is_cfm_yn: false, del_yn: false, mem_id: null, match_st_cd: "unmatched",
    project_id: null, txn_amt: 5000, txn_dt: "2026-11-10", txn_io_enm: "withdrawal", fee_item_cd: "expense", ...over,
  });
  const db = (txns: Row[]) =>
    new FakeSupabase({
      fee_txn_hist: txns,
      fee_due_pay_hist: [],
      fee_prj_mst: [],
      team_mem_rel: [{ team_id: TEAM, mem_id: M1, vers: 0, del_yn: false, mem_st_cd: "active" }],
      cmm_cd_mst: ["due", "event_fee", "expense", "other", "opr_fund", "fund_return", "dep_refund"].map(code),
    });

  it("사용자가 바꾼 분류가 방향에 안 맞으면 거부하고 아무것도 쓰지 않는다", async () => {
    const f = db([pending("a")]);
    const r = await confirmTransactionsCore(asDb(f), { teamId: TEAM, actorMemId: ACTOR, items: [{ txnId: "a", feeItemCd: "due", memId: M1 }] });
    expect(r.ok).toBe(false);
    expect(f.tables.fee_txn_hist[0].is_cfm_yn).toBe(false);
    const g = db([pending("b", { txn_io_enm: "deposit", fee_item_cd: "due" })]);
    const r2 = await confirmTransactionsCore(asDb(g), { teamId: TEAM, actorMemId: ACTOR, items: [{ txnId: "b", feeItemCd: "dep_refund", memId: M1 }] });
    expect(r2.ok).toBe(false);
  });

  it("저장값만으로 확정되는 기존 행은 방향이 안 맞아도 관용한다", async () => {
    const f = db([pending("c", { txn_io_enm: "deposit", fee_item_cd: "expense" })]);
    const r = await confirmTransactionsCore(asDb(f), { teamId: TEAM, actorMemId: ACTOR, items: [{ txnId: "c" }] });
    expect(r).toMatchObject({ ok: true, confirmed: 1 });
  });

  it("예치금 환급은 회원이 없으면 거부, 있으면 확정되지만 납부원장은 만들지 않는다", async () => {
    const f = db([pending("d")]);
    const no = await confirmTransactionsCore(asDb(f), { teamId: TEAM, actorMemId: ACTOR, items: [{ txnId: "d", feeItemCd: "dep_refund" }] });
    expect(no.ok).toBe(false);
    const ok = await confirmTransactionsCore(asDb(f), { teamId: TEAM, actorMemId: ACTOR, items: [{ txnId: "d", feeItemCd: "dep_refund", memId: M1 }] });
    expect(ok).toMatchObject({ ok: true, confirmed: 1 });
    expect(f.tables.fee_due_pay_hist).toHaveLength(0);
  });

  it("지출(expense)은 프로젝트 귀속을 달 수 있고(선택), 회비·제외 분류로 바꾸면 귀속이 비워진다(#707)", async () => {
    const PRJ = "bbbbbbbb-0000-4000-8000-000000000001";
    const f = db([pending("p1"), pending("p2")]);
    f.tables.fee_prj_mst.push({ prj_id: PRJ, team_id: TEAM, del_yn: false });
    const r = await confirmTransactionsCore(asDb(f), {
      teamId: TEAM, actorMemId: ACTOR,
      items: [{ txnId: "p1", feeItemCd: "expense", prjId: PRJ }, { txnId: "p2", feeItemCd: "expense" }],
    });
    expect(r).toMatchObject({ ok: true, confirmed: 2 });
    expect(f.tables.fee_txn_hist.find((t) => t.txn_id === "p1")!.project_id).toBe(PRJ);
    expect(f.tables.fee_txn_hist.find((t) => t.txn_id === "p2")!.project_id).toBeNull();
    const g = db([pending("p3", { project_id: PRJ })]);
    g.tables.fee_prj_mst.push({ prj_id: PRJ, team_id: TEAM, del_yn: false });
    const o = await confirmTransactionsCore(asDb(g), { teamId: TEAM, actorMemId: ACTOR, items: [{ txnId: "p3", feeItemCd: "opr_fund" }] });
    expect(o.ok).toBe(true);
    expect(g.tables.fee_txn_hist[0].project_id).toBeNull();
  });

  it("다른 팀 프로젝트로 지출을 귀속하면 거부한다(#707)", async () => {
    const f = db([pending("q1")]);
    const r = await confirmTransactionsCore(asDb(f), {
      teamId: TEAM, actorMemId: ACTOR, items: [{ txnId: "q1", feeItemCd: "expense", prjId: "bbbbbbbb-0000-4000-8000-0000000000ff" }],
    });
    expect(r.ok).toBe(false);
    expect(f.tables.fee_txn_hist[0].is_cfm_yn).toBe(false);
  });
});
