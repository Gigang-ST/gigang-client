import { describe, expect, it } from "vitest";

import { deriveTxnStatus } from "@/lib/dues/txn-status";

describe("deriveTxnStatus", () => {
  it("미확정 → 처리대기", () => {
    expect(deriveTxnStatus({ isConfirmed: false, isReflected: false })).toBe("처리대기");
  });
  it("확정·미반영 → 확정", () => {
    expect(deriveTxnStatus({ isConfirmed: true, isReflected: false })).toBe("확정");
  });
  it("반영됨 → 반영완료", () => {
    expect(deriveTxnStatus({ isConfirmed: true, isReflected: true })).toBe("반영완료");
  });
});
