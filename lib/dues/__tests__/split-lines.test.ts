import { describe, expect, it } from "vitest";

import { normalizeSplitLine, splitLinesIssue, type SplitLine } from "@/lib/dues/split-lines";

const MEM = "11111111-1111-1111-1111-111111111111";
const PRJ = "22222222-2222-2222-2222-222222222222";

const line = (p: Partial<SplitLine>): SplitLine => ({ amt: 1000, feeItemCd: "due", memId: MEM, prjId: null, ...p });

describe("splitLinesIssue — 나눠 넣기 검증(#754)", () => {
  it("프로젝트비 + 회비로 나눠 합계가 맞으면 통과", () => {
    const lines = [line({ amt: 40000, feeItemCd: "event_fee", prjId: PRJ }), line({ amt: 2000 })];
    expect(splitLinesIssue("deposit", 42000, lines)).toBeNull();
  });

  it("1줄이면 거부", () => {
    expect(splitLinesIssue("deposit", 1000, [line({})])).toMatch(/2줄/);
  });

  it("합계가 다르면 거부(모자람·넘침 모두)", () => {
    expect(splitLinesIssue("deposit", 42000, [line({ amt: 40000 }), line({ amt: 1000 })])).toMatch(/합계/);
    expect(splitLinesIssue("deposit", 42000, [line({ amt: 40000 }), line({ amt: 3000 })])).toMatch(/합계/);
  });

  it("0원·음수·소수 금액은 거부", () => {
    expect(splitLinesIssue("deposit", 1000, [line({ amt: 0 }), line({ amt: 1000 })])).toMatch(/1원 이상/);
    expect(splitLinesIssue("deposit", 1000, [line({ amt: -500 }), line({ amt: 1500 })])).toMatch(/1원 이상/);
    expect(splitLinesIssue("deposit", 1000, [line({ amt: 500.5 }), line({ amt: 499.5 })])).toMatch(/1원 이상/);
    expect(splitLinesIssue("deposit", 1000, [line({ amt: Number.NaN }), line({ amt: 1000 })])).toMatch(/1원 이상/);
  });

  it("회비 줄은 회원이, 프로젝트 줄은 프로젝트가 있어야 한다", () => {
    expect(splitLinesIssue("deposit", 2000, [line({ memId: null }), line({})])).toMatch(/대상/);
    expect(splitLinesIssue("deposit", 2000, [line({ feeItemCd: "event_fee", prjId: null }), line({})])).toMatch(/대상/);
  });

  it("운영자금·공금 반환·제외 줄은 대상 없이 통과", () => {
    const lines = [line({ feeItemCd: "opr_fund", memId: null }), line({ feeItemCd: "other", memId: null })];
    expect(splitLinesIssue("deposit", 2000, lines)).toBeNull();
  });

  it("입출금 방향이 어긋난 분류는 거부 — 출금은 회비 불가, 입금은 지출 불가", () => {
    expect(splitLinesIssue("withdrawal", 2000, [line({}), line({ feeItemCd: "expense", memId: null })])).toMatch(/출금/);
    expect(splitLinesIssue("deposit", 2000, [line({}), line({ feeItemCd: "expense", memId: null })])).toMatch(/입금/);
  });
});

describe("normalizeSplitLine", () => {
  it("회원을 안 붙이는 분류는 회원을, 프로젝트를 못 다는 분류는 프로젝트를 비운다", () => {
    expect(normalizeSplitLine(line({ feeItemCd: "opr_fund", memId: MEM, prjId: PRJ }))).toMatchObject({ memId: null, prjId: null });
    expect(normalizeSplitLine(line({ feeItemCd: "due", prjId: PRJ }))).toMatchObject({ memId: MEM, prjId: null });
    expect(normalizeSplitLine(line({ feeItemCd: "event_fee", prjId: PRJ }))).toMatchObject({ memId: MEM, prjId: PRJ });
  });
});
