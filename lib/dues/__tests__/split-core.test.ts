import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase, type Row } from "@/app/api/mcp/__tests__/fake-supabase";

const { recalcMock } = vi.hoisted(() => ({
  recalcMock: vi.fn(async (_db: unknown, input: { memIds?: string[] }) => ({
    ok: true as const,
    message: null,
    updatedCount: input.memIds?.length ?? 0,
  })),
}));
vi.mock("@/lib/dues/recalc-core", () => ({ recalculateBalanceCore: recalcMock }));

import { cancelTransactionCore } from "@/lib/dues/cancel-core";
import { splitConfirmCore } from "@/lib/dues/split-core";
import type { SplitLine } from "@/lib/dues/split-lines";

/**
 * 분할 확정·취소(#754) — 인메모리 Supabase 위에서 코어를 진짜로 돌린다.
 * 보는 것: 부모 숨김·자식 확정·납부원장 생성, 합계 불일치 거부, 중간 실패 롤백, 취소 시 인박스 복귀.
 */

const TEAM = "22222222-2222-4222-8222-222222222222";
const ADMIN = "11111111-1111-4111-8111-111111111111";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_TEAM_MEM = "aaaaaaaa-0000-4000-8000-0000000000ff";
const PRJ = "dddddddd-0000-4000-8000-000000000001";
const T42 = "eeeeeeee-0000-4000-8000-000000000042"; // 입금 42,000원
const T_DONE = "eeeeeeee-0000-4000-8000-000000000043"; // 이미 확정

function txn(id: string, over: Row): Row {
  return {
    txn_id: id,
    team_id: TEAM,
    upd_id: "upd",
    txn_dt: "2026-11-25",
    txn_tm: "10:00:00",
    txn_amt: 42000,
    txn_bal_amt: 100000,
    txn_io_enm: "deposit",
    raw_name: "홍길동",
    raw_memo: null,
    txn_tp_txt: "입금",
    mem_id: null,
    match_st_cd: "unmatched",
    fee_item_cd: null,
    project_id: null,
    is_cfm_yn: false,
    del_yn: false,
    split_yn: false,
    split_parent_id: null,
    ...over,
  };
}

function seed() {
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
    team_mem_rel: [{ mem_id: M1, team_id: TEAM, vers: 0, del_yn: false, mem_st_cd: "active" }],
    cmm_cd_mst: ["due", "event_fee", "expense", "other", "opr_fund", "fund_return", "dep_refund"].map(code),
    fee_prj_mst: [{ prj_id: PRJ, prj_nm: "겨울 프로젝트", team_id: TEAM, st_cd: "active", vers: 0, del_yn: false }],
    fee_mem_bal_snap: [],
    fee_due_pay_hist: [],
    fee_txn_hist: [txn(T42, {}), txn(T_DONE, { is_cfm_yn: true, fee_item_cd: "due", mem_id: M1 })],
  });
}

const PROJECT_40K: SplitLine = { amt: 40000, feeItemCd: "event_fee", memId: M1, prjId: PRJ };
const DUE_2K: SplitLine = { amt: 2000, feeItemCd: "due", memId: M1, prjId: null };

let db: FakeSupabase;
const rows = (): Row[] => db.tables["fee_txn_hist"];
const actor = { teamId: TEAM, actorMemId: ADMIN };

beforeEach(() => {
  recalcMock.mockClear();
  db = seed();
});

describe("splitConfirmCore", () => {
  it("프로젝트 4만 + 회비 2천으로 나누면 부모는 숨고 자식 2줄이 확정되며 회비 줄만 납부원장이 생긴다", async () => {
    const r = await splitConfirmCore(db.asClient(), { ...actor, txnId: T42, lines: [PROJECT_40K, DUE_2K] });
    expect(r.ok).toBe(true);

    const parent = rows().find((t) => t.txn_id === T42)!;
    expect(parent).toMatchObject({ del_yn: true, split_yn: true, is_cfm_yn: false });

    const kids = rows().filter((t) => t.split_parent_id === T42);
    expect(kids).toHaveLength(2);
    expect(kids.every((k) => k.is_cfm_yn === true && k.del_yn === false && k.cfm_by_mem_id === ADMIN)).toBe(true);
    expect(kids.map((k) => [k.fee_item_cd, k.txn_amt, k.project_id, k.mem_id])).toEqual([
      ["event_fee", 40000, PRJ, M1],
      ["due", 2000, null, M1],
    ]);
    // 날짜·이름·통장잔액은 원거래를 그대로 따른다
    expect(kids.every((k) => k.txn_dt === "2026-11-25" && k.raw_name === "홍길동" && k.txn_bal_amt === 100000)).toBe(true);

    const pays = db.tables["fee_due_pay_hist"];
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ mem_id: M1, pay_amt: 2000, pay_st_cd: "paid", src_txn_id: kids[1].txn_id });

    if (r.ok) expect(r.memIds).toEqual([M1]);
  });

  it("합계가 원래 금액과 다르면 아무것도 쓰지 않고 거부", async () => {
    const r = await splitConfirmCore(db.asClient(), { ...actor, txnId: T42, lines: [PROJECT_40K, { ...DUE_2K, amt: 1000 }] });
    expect(r.ok).toBe(false);
    expect(db.opsOn("fee_txn_hist", "insert")).toHaveLength(0);
    expect(db.opsOn("fee_txn_hist", "update")).toHaveLength(0);
  });

  it("이 팀 회원이 아닌 사람·없는 프로젝트가 있으면 거부", async () => {
    const a = await splitConfirmCore(db.asClient(), { ...actor, txnId: T42, lines: [PROJECT_40K, { ...DUE_2K, memId: OTHER_TEAM_MEM }] });
    expect(a.ok).toBe(false);
    const b = await splitConfirmCore(db.asClient(), {
      ...actor,
      txnId: T42,
      lines: [{ ...PROJECT_40K, prjId: "dddddddd-0000-4000-8000-0000000000ff" }, DUE_2K],
    });
    expect(b.ok).toBe(false);
    expect(rows().find((t) => t.txn_id === T42)).toMatchObject({ del_yn: false, split_yn: false });
  });

  it("이미 확정된 거래·이미 나눈 거래는 나눌 수 없다", async () => {
    const done = await splitConfirmCore(db.asClient(), { ...actor, txnId: T_DONE, lines: [PROJECT_40K, DUE_2K] });
    expect(done.ok).toBe(false);

    await splitConfirmCore(db.asClient(), { ...actor, txnId: T42, lines: [PROJECT_40K, DUE_2K] });
    const again = await splitConfirmCore(db.asClient(), { ...actor, txnId: T42, lines: [PROJECT_40K, DUE_2K] });
    expect(again.ok).toBe(false);
  });

  it("납부원장 저장이 실패하면 자식을 지우고 부모를 되살린다", async () => {
    db.errors["fee_due_pay_hist:insert"] = { message: "boom" };
    const r = await splitConfirmCore(db.asClient(), { ...actor, txnId: T42, lines: [PROJECT_40K, DUE_2K] });
    expect(r.ok).toBe(false);
    expect(rows().filter((t) => t.split_parent_id === T42)).toHaveLength(0);
    expect(rows().find((t) => t.txn_id === T42)).toMatchObject({ del_yn: false, split_yn: false, is_cfm_yn: false });
  });

  it("dryRun 은 검증만 하고 쓰지 않는다", async () => {
    const r = await splitConfirmCore(db.asClient(), { ...actor, txnId: T42, lines: [PROJECT_40K, DUE_2K], dryRun: true });
    expect(r.ok).toBe(true);
    expect(db.opsOn("fee_txn_hist", "insert")).toHaveLength(0);
    expect(db.opsOn("fee_txn_hist", "update")).toHaveLength(0);
  });
});

describe("cancelTransactionCore — 나눈 건", () => {
  it("한 줄만 취소해도 줄 전체가 내려가고 원거래가 인박스로 돌아오며 납부원장이 취소된다", async () => {
    await splitConfirmCore(db.asClient(), { ...actor, txnId: T42, lines: [PROJECT_40K, DUE_2K] });
    const kids = rows().filter((t) => t.split_parent_id === T42);

    const r = await cancelTransactionCore(db.asClient(), { ...actor, txnId: kids[0].txn_id as string });
    expect(r.ok).toBe(true);

    const after = rows().filter((t) => t.split_parent_id === T42);
    expect(after.every((k) => k.del_yn === true && k.is_cfm_yn === false)).toBe(true);
    expect(rows().find((t) => t.txn_id === T42)).toMatchObject({ del_yn: false, split_yn: false, is_cfm_yn: false });
    expect(db.tables["fee_due_pay_hist"][0].pay_st_cd).toBe("cancelled");
    expect(recalcMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ memIds: [M1] }));

    // 취소 뒤에는 다시 나눌 수 있다
    const again = await splitConfirmCore(db.asClient(), { ...actor, txnId: T42, lines: [DUE_2K, PROJECT_40K] });
    expect(again.ok).toBe(true);
  });

  it("dryRun 은 split 표시만 돌려주고 쓰지 않는다", async () => {
    await splitConfirmCore(db.asClient(), { ...actor, txnId: T42, lines: [PROJECT_40K, DUE_2K] });
    const kid = rows().find((t) => t.split_parent_id === T42)!;
    const before = db.opsOn("fee_txn_hist", "update").length;
    const r = await cancelTransactionCore(db.asClient(), { ...actor, txnId: kid.txn_id as string, dryRun: true });
    expect(r.ok).toBe(true);
    expect("split" in r && r.split).toBe(true);
    expect(db.opsOn("fee_txn_hist", "update")).toHaveLength(before);
  });

  it("일반 확정 거래는 종전대로 한 건만 취소된다", async () => {
    const r = await cancelTransactionCore(db.asClient(), { ...actor, txnId: T_DONE });
    expect(r.ok).toBe(true);
    expect(rows().find((t) => t.txn_id === T_DONE)).toMatchObject({ is_cfm_yn: false, del_yn: false });
  });
});
