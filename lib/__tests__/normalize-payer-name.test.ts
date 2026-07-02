import { describe, expect, it } from "vitest";

import { normalizePayerName } from "@/lib/dues/normalize-payer-name";

describe("normalizePayerName", () => {
  it("공백 제거", () => {
    expect(normalizePayerName("홍 길 동")).toBe("홍길동");
  });
  it("앞에 붙은 '회비' 토큰 제거", () => {
    expect(normalizePayerName("회비 홍길동")).toBe("홍길동");
  });
  it("뒤에 붙은 '회비' 토큰 제거", () => {
    expect(normalizePayerName("홍길동회비")).toBe("홍길동");
  });
  it("숫자·특수문자 제거", () => {
    expect(normalizePayerName("홍길동2000")).toBe("홍길동");
    expect(normalizePayerName("홍길동(회비)")).toBe("홍길동");
  });
  it("영문은 소문자화", () => {
    expect(normalizePayerName("MinChoLover")).toBe("mincholover");
  });
  it("빈 입력은 빈 문자열", () => {
    expect(normalizePayerName("   ")).toBe("");
  });
});
