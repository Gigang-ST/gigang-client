import { describe, expect, it } from "vitest";

import { buildConfirmPayload, type Decision } from "@/lib/dues/confirm-payload";

const ref = (txnId: string, rawName = txnId) => ({ txnId, rawName });
const d = (p: Partial<Decision>): Decision => ({ memId: null, itemCd: "due", remember: false, prjId: null, ...p });

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

  it("review 회비는 feeItemCd=due + memId (prjId는 null)", () => {
    const decisions: Record<string, Decision> = {
      r1: d({ memId: "m1", itemCd: "due" }),
    };
    const { items } = buildConfirmPayload({ autoDone: [], excluded: [], review: [ref("r1")], decisions });
    expect(items).toEqual([{ txnId: "r1", feeItemCd: "due", memId: "m1", prjId: null }]);
  });

  it("review 프로젝트는 memId·prjId를 함께 넘긴다 — 명단의 핵심", () => {
    const decisions: Record<string, Decision> = {
      r1: d({ memId: "m1", itemCd: "event_fee", prjId: "p1" }),
    };
    const { items } = buildConfirmPayload({ autoDone: [], excluded: [], review: [ref("r1")], decisions });
    expect(items).toEqual([{ txnId: "r1", feeItemCd: "event_fee", memId: "m1", prjId: "p1" }]);
  });

  it("review 제외는 memId·prjId 모두 null", () => {
    const decisions: Record<string, Decision> = {
      r1: d({ memId: "m1", itemCd: "other", prjId: "p1" }),
    };
    const { items } = buildConfirmPayload({ autoDone: [], excluded: [], review: [ref("r1")], decisions });
    expect(items).toEqual([{ txnId: "r1", feeItemCd: "other", memId: null, prjId: null }]);
  });

  it("회비로 확정하면 프로젝트 귀속은 실리지 않는다(prjId null)", () => {
    const decisions: Record<string, Decision> = {
      r1: d({ memId: "m1", itemCd: "due", prjId: "p1" }), // 프로젝트 골랐다가 회비로 되돌린 경우
    };
    const { items } = buildConfirmPayload({ autoDone: [], excluded: [], review: [ref("r1")], decisions });
    expect(items).toEqual([{ txnId: "r1", feeItemCd: "due", memId: "m1", prjId: null }]);
  });

  it("aliasLearn은 remember && 회비 && memId 인 것만", () => {
    const decisions: Record<string, Decision> = {
      r1: d({ memId: "m1", itemCd: "due", remember: true }),
      r2: d({ memId: "m2", itemCd: "due", remember: false }),
      r3: d({ memId: "m3", itemCd: "event_fee", remember: true, prjId: "p1" }),
      r4: d({ memId: null, itemCd: "due", remember: true }),
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
      decisions: { r1: d({ memId: "m1", itemCd: "due" }) },
    });
    expect(items.map((i) => i.txnId)).toEqual(["a1", "x1", "r1"]);
  });

  it("review 항목에 decision이 없으면 명확한 에러를 던진다", () => {
    expect(() =>
      buildConfirmPayload({ autoDone: [], excluded: [], review: [ref("r1")], decisions: {} }),
    ).toThrow(/decision이 없습니다/);
  });
});
