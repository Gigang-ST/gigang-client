import { describe, expect, it } from "vitest";

import { buildConfirmPayload, type Decision } from "@/lib/dues/confirm-payload";

const ref = (txnId: string, rawName = txnId) => ({ txnId, rawName });

describe("buildConfirmPayload", () => {
  it("autoDone·excluded는 txnId만 넘긴다", () => {
    const { items } = buildConfirmPayload({
      autoDone: [ref("a1")],
      excluded: [ref("x1")],
      review: [],
      decisions: {},
    });
    expect(items).toEqual([{ txnId: "a1" }, { txnId: "x1" }]);
  });

  it("review 회비는 feeItemCd=due + memId", () => {
    const decisions: Record<string, Decision> = {
      r1: { memId: "m1", itemCd: "due", remember: false },
    };
    const { items } = buildConfirmPayload({ autoDone: [], excluded: [], review: [ref("r1")], decisions });
    expect(items).toEqual([{ txnId: "r1", feeItemCd: "due", memId: "m1" }]);
  });

  it("review 프로젝트·제외는 memId null", () => {
    const decisions: Record<string, Decision> = {
      r1: { memId: "m1", itemCd: "event_fee", remember: false },
      r2: { memId: null, itemCd: "other", remember: false },
    };
    const { items } = buildConfirmPayload({
      autoDone: [], excluded: [], review: [ref("r1"), ref("r2")], decisions,
    });
    expect(items).toEqual([
      { txnId: "r1", feeItemCd: "event_fee", memId: null },
      { txnId: "r2", feeItemCd: "other", memId: null },
    ]);
  });

  it("aliasLearn은 remember && 회비 && memId 인 것만", () => {
    const decisions: Record<string, Decision> = {
      r1: { memId: "m1", itemCd: "due", remember: true },
      r2: { memId: "m2", itemCd: "due", remember: false },
      r3: { memId: "m3", itemCd: "event_fee", remember: true },
      r4: { memId: null, itemCd: "due", remember: true },
    };
    const { aliasLearn } = buildConfirmPayload({
      autoDone: [], excluded: [],
      review: [ref("r1", "회비홍길동"), ref("r2"), ref("r3"), ref("r4")],
      decisions,
    });
    expect(aliasLearn).toEqual([{ rawName: "회비홍길동", memId: "m1" }]);
  });

  it("items 순서는 autoDone → excluded → review", () => {
    const { items } = buildConfirmPayload({
      autoDone: [ref("a1")],
      excluded: [ref("x1")],
      review: [ref("r1")],
      decisions: { r1: { memId: "m1", itemCd: "due", remember: false } },
    });
    expect(items.map((i) => i.txnId)).toEqual(["a1", "x1", "r1"]);
  });

  it("review 항목에 decision이 없으면 명확한 에러를 던진다", () => {
    expect(() =>
      buildConfirmPayload({ autoDone: [], excluded: [], review: [ref("r1")], decisions: {} }),
    ).toThrow(/decision이 없습니다/);
  });
});
