import { describe, expect, it } from "vitest";

import { projectMoney } from "@/lib/dues/project-money";

describe("projectMoney(#707)", () => {
  it("남은 돈 = 모금 − 지출, 모금 중이면 그대로 보유액", () => {
    expect(projectMoney(500000, 180000, "active")).toEqual({
      raisedAmt: 500000,
      spentAmt: 180000,
      remainingAmt: 320000,
      heldAmt: 320000,
    });
  });
  it("마감(정산 완료)이면 남은 돈이 있어도 보유액은 0", () => {
    const m = projectMoney(500000, 180000, "closed");
    expect(m.remainingAmt).toBe(320000);
    expect(m.heldAmt).toBe(0);
  });
  it("지출이 모금보다 많으면 남은 돈이 음수로 드러난다", () => {
    expect(projectMoney(100000, 130000, "active").remainingAmt).toBe(-30000);
  });
});
