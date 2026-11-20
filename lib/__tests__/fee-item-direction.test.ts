import { describe, expect, it } from "vitest";

import { calcFreeFund, sumOperatorFundNet } from "@/lib/dues/overview-calc";
import { canReclassifyTo } from "@/lib/dues/confirm-scope";
import { buildConfirmPayload } from "@/lib/dues/confirm-payload";
import { directionIssue, isItemDecided, itemOrderFor } from "@/lib/dues/fee-item-direction";

describe("directionIssue", () => {
  it("출금은 회비·프로젝트로 확정할 수 없다", () => {
    expect(directionIssue("withdrawal", "due")).not.toBeNull();
    expect(directionIssue("withdrawal", "event_fee")).not.toBeNull();
  });
  it("입금은 지출·예치금 환급으로 확정할 수 없다", () => {
    expect(directionIssue("deposit", "expense")).not.toBeNull();
    expect(directionIssue("deposit", "dep_refund")).not.toBeNull();
  });
  it("운영자금·공금 반환은 입출금 모두 가능, 예치금 환급은 출금 가능", () => {
    for (const io of ["deposit", "withdrawal"]) {
      expect(directionIssue(io, "opr_fund")).toBeNull();
      expect(directionIssue(io, "fund_return")).toBeNull();
    }
    expect(directionIssue("withdrawal", "dep_refund")).toBeNull();
  });
  it("방향을 모르면 판단하지 않는다", () => {
    expect(directionIssue(undefined, "due")).toBeNull();
  });
});

describe("분류 어휘", () => {
  it("입금 행에는 예치금 환급이, 출금 행에는 회비·프로젝트가 없다", () => {
    expect(itemOrderFor("deposit")).not.toContain("dep_refund");
    expect(itemOrderFor("withdrawal")).not.toContain("due");
    expect(itemOrderFor("withdrawal")).not.toContain("event_fee");
  });
  it("canReclassifyTo 는 어휘를 따른다", () => {
    expect(canReclassifyTo("withdrawal", "due")).toBe(false);
    expect(canReclassifyTo("withdrawal", "dep_refund")).toBe(true);
    expect(canReclassifyTo("deposit", "opr_fund")).toBe(true);
  });
});

describe("buildConfirmPayload — 중립 분류", () => {
  it("회원·프로젝트를 비워 보낸다", () => {
    const { items, aliasLearn } = buildConfirmPayload({
      autoDone: [],
      excluded: [],
      review: [{ txnId: "t1", rawName: "홍길동" }],
      decisions: { t1: { memId: "m1", itemCd: "opr_fund", remember: true, prjId: "p1" } },
    });
    expect(items).toEqual([{ txnId: "t1", feeItemCd: "opr_fund", memId: null, prjId: null }]);
    expect(aliasLearn).toEqual([]);
  });
});

describe("isItemDecided", () => {
  it("예치금 환급은 회원이 있어야 결정된 것", () => {
    expect(isItemDecided({ itemCd: "dep_refund", memId: null, prjId: null })).toBe(false);
    expect(isItemDecided({ itemCd: "dep_refund", memId: "m", prjId: null })).toBe(true);
  });
  it("운영자금·공금 반환·제외는 분류만으로 결정", () => {
    for (const itemCd of ["opr_fund", "fund_return", "other"]) {
      expect(isItemDecided({ itemCd, memId: null, prjId: null })).toBe(true);
    }
  });
  it("프로젝트는 귀속 필수, 회비는 회원 필수", () => {
    expect(isItemDecided({ itemCd: "event_fee", memId: null, prjId: null })).toBe(false);
    expect(isItemDecided({ itemCd: "due", memId: null, prjId: "p" })).toBe(false);
  });
});

describe("운영자금·공금 현황 계산", () => {
  it("운영자금·공금 순액만 모으고(입금−출금) 다른 분류는 무시", () => {
    expect(
      sumOperatorFundNet([
        { fee_item_cd: "opr_fund", txn_io_enm: "deposit", txn_amt: 100000 },
        { fee_item_cd: "opr_fund", txn_io_enm: "withdrawal", txn_amt: 30000 },
        { fee_item_cd: "fund_return", txn_io_enm: "deposit", txn_amt: 5000 },
        { fee_item_cd: "due", txn_io_enm: "deposit", txn_amt: 999 },
      ]),
    ).toBe(75000);
  });
  it("자유 회비 = 통장 − 프로젝트 − 예치금 − 운영자금 순액", () => {
    expect(calcFreeFund({ bankBalance: 500000, projectTotal: 100000, prepaidTotal: 50000, operatorFundNet: 75000 })).toBe(275000);
    expect(calcFreeFund({ bankBalance: null, projectTotal: 0, prepaidTotal: 0, operatorFundNet: 0 })).toBeNull();
  });
});

describe("buildConfirmPayload — 예치금 환급", () => {
  it("회원을 유지해 보내고 별칭은 학습하지 않는다", () => {
    const { items, aliasLearn } = buildConfirmPayload({
      autoDone: [],
      excluded: [],
      review: [{ txnId: "t2", rawName: "홍길동" }],
      decisions: { t2: { memId: "m1", itemCd: "dep_refund", remember: true, prjId: null } },
    });
    expect(items).toEqual([{ txnId: "t2", feeItemCd: "dep_refund", memId: "m1", prjId: null }]);
    expect(aliasLearn).toEqual([]);
  });
});
