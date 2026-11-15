import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("정상 경로는 그대로(쿼리·해시 포함)", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/profile")).toBe("/profile");
    expect(safeNextPath("/races?tab=a&x=1#top")).toBe("/races?tab=a&x=1#top");
    expect(safeNextPath("/onboarding?next=%2Fprofile")).toBe("/onboarding?next=%2Fprofile");
  });

  it("외부 주소 형태는 폴백", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("/%5Cevil.com")).toBe("/");
    expect(safeNextPath("/%5cevil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("/\t/evil.com")).toBe("/");
    expect(safeNextPath("/\n/evil.com")).toBe("/");
    expect(safeNextPath("evil.com")).toBe("/");
  });

  it("빈 값·null·undefined는 폴백, 폴백 지정 가능", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("//evil.com", "/onboarding")).toBe("/onboarding");
    expect(safeNextPath(null, "/profile")).toBe("/profile");
  });
});
