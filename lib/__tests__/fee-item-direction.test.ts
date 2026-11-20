import { describe, expect, it } from "vitest";

import { canReclassifyTo } from "@/lib/dues/confirm-scope";
import { buildConfirmPayload } from "@/lib/dues/confirm-payload";
import { directionIssue, isNeutralItemCd, itemOrderFor } from "@/lib/dues/fee-item-direction";

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
  it("중립 분류 3종만 isNeutralItemCd", () => {
    expect(["opr_fund", "fund_return", "dep_refund"].every(isNeutralItemCd)).toBe(true);
    expect(["due", "event_fee", "other", "expense"].some(isNeutralItemCd)).toBe(false);
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
