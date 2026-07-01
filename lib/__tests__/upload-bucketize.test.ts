import { describe, expect, it } from "vitest";

import { bucketOf } from "@/lib/dues/upload-bucketize";

describe("bucketOf", () => {
  it("출금은 제외", () => {
    expect(bucketOf({ io: "withdrawal", itemCd: "expense", matchStatus: "unmatched" })).toBe("excluded");
  });
  it("예금이자(other)는 제외", () => {
    expect(bucketOf({ io: "deposit", itemCd: "other", matchStatus: "unmatched" })).toBe("excluded");
  });
  it("입금+회비+매칭 → 자동완료", () => {
    expect(bucketOf({ io: "deposit", itemCd: "due", matchStatus: "matched" })).toBe("autoDone");
  });
  it("입금+회비+미매칭 → 확인필요", () => {
    expect(bucketOf({ io: "deposit", itemCd: "due", matchStatus: "unmatched" })).toBe("needsReview");
  });
  it("입금+회비+동명이인 → 확인필요", () => {
    expect(bucketOf({ io: "deposit", itemCd: "due", matchStatus: "ambiguous" })).toBe("needsReview");
  });
});
