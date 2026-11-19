import { describe, expect, it } from "vitest";

import { amountHintLabel, amountHintOf, projectAmountsOf, type ProjectFeeRule } from "@/lib/dues/amount-hint";

const rule: ProjectFeeRule = {
  evtId: "evt-1",
  evtNm: "동계 10K 클래스",
  amounts: [40000, 35000],
  registrantMemIds: ["m-reg"],
};

describe("projectAmountsOf", () => {
  it("보증금+참가비, 할인 적용분, 참가자별 실제 합계를 모은다", () => {
    const amounts = projectAmountsOf({
      depositAmt: 30000,
      entryFeeAmt: 10000,
      mlgDcAmt: 5000,
      participants: [{ depositAmt: 0, entryFeeAmt: 10000 }],
    });
    expect(amounts.sort((a, b) => a - b)).toEqual([10000, 35000, 40000]);
  });
  it("0원은 뺀다", () => {
    expect(projectAmountsOf({ depositAmt: 0, entryFeeAmt: 0, mlgDcAmt: 0, participants: [] })).toEqual([]);
  });
});

describe("amountHintOf", () => {
  const base = { io: "deposit" as const, rules: [rule], monthlyFeeAmt: 4000 };

  it("프로젝트 참가비와 같은 금액 + 등록자 → project(registered=true)", () => {
    expect(amountHintOf({ ...base, amt: 40000, memId: "m-reg" })).toMatchObject({ kind: "project", registered: true });
  });
  it("월회비 배수(40,000)여도 프로젝트 금액이면 프로젝트가 먼저다", () => {
    expect(amountHintOf({ ...base, amt: 40000, memId: "m-x" })).toMatchObject({ kind: "project", registered: false });
  });
  it("입금자를 모르면 registered=null", () => {
    expect(amountHintOf({ ...base, amt: 35000, memId: null })).toMatchObject({ kind: "project", registered: null });
  });
  it("프로젝트 금액이 아니고 월회비 배수가 아니면 nonUnit", () => {
    expect(amountHintOf({ ...base, amt: 3000, memId: "m-x" })).toEqual({ kind: "nonUnit", monthlyFeeAmt: 4000 });
  });
  it("월회비 배수이고 프로젝트 금액이 아니면 힌트 없음(정상 회비)", () => {
    expect(amountHintOf({ ...base, amt: 8000, memId: "m-x" })).toBeNull();
  });
  it("출금은 판정하지 않는다", () => {
    expect(amountHintOf({ ...base, io: "withdrawal", amt: 40000, memId: null })).toBeNull();
  });
  it("월회비 단가를 모르면 nonUnit 판정을 건너뛴다", () => {
    expect(amountHintOf({ ...base, monthlyFeeAmt: 0, amt: 3000, memId: null })).toBeNull();
  });
  it("진행 중 프로젝트가 없으면 프로젝트 힌트가 없다", () => {
    expect(amountHintOf({ ...base, rules: [], amt: 40000, memId: "m-reg" })).toBeNull();
  });
  it("여러 프로젝트가 같은 금액이면 등록자인 쪽을 고른다", () => {
    const other: ProjectFeeRule = { evtId: "evt-2", evtNm: "다른 프로젝트", amounts: [40000], registrantMemIds: [] };
    const hint = amountHintOf({ ...base, rules: [other, rule], amt: 40000, memId: "m-reg" });
    expect(hint).toMatchObject({ kind: "project", evtId: "evt-1" });
  });
});

describe("amountHintLabel", () => {
  it("등록 여부에 따라 문구가 갈린다", () => {
    expect(amountHintLabel({ kind: "project", evtId: "e", evtNm: "P", registered: true })).toContain("등록자예요");
    expect(amountHintLabel({ kind: "project", evtId: "e", evtNm: "P", registered: false })).toContain("등록자가 아니에요");
    expect(amountHintLabel({ kind: "nonUnit", monthlyFeeAmt: 4000 })).toContain("월회비 단위");
  });
});
