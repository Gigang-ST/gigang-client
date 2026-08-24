import { describe, it, expect } from "vitest";

import { DEFAULT_BACK_HREF, resolveBackAction } from "@/lib/back-nav";

describe("뒤로가기 판정 (#450)", () => {
  it("히스토리가 이 문서 하나뿐이면 폴백으로 보낸다 — router.back()이 조용히 죽는 자리", () => {
    expect(resolveBackAction(1, "/settings")).toEqual({ type: "replace", href: "/settings" });
  });

  it("돌아갈 항목이 있으면 진짜 뒤로 간다", () => {
    expect(resolveBackAction(2, "/settings")).toEqual({ type: "back" });
    expect(resolveBackAction(17, "/settings")).toEqual({ type: "back" });
  });

  it("폴백 경로를 그대로 실어 보낸다 — 화면마다 다른 곳으로 빠질 수 있어야 한다", () => {
    expect(resolveBackAction(1, "/board")).toEqual({ type: "replace", href: "/board" });
    expect(resolveBackAction(1, "/board/abc")).toEqual({ type: "replace", href: "/board/abc" });
  });

  it("기본 폴백은 어느 화면에서든 안전한 지면", () => {
    expect(DEFAULT_BACK_HREF).toBe("/");
    expect(resolveBackAction(1, DEFAULT_BACK_HREF)).toEqual({ type: "replace", href: "/" });
  });

  it("0도 폴백 — 이론상 안 나오지만 back()이 못 가는 건 마찬가지다", () => {
    expect(resolveBackAction(0, "/")).toEqual({ type: "replace", href: "/" });
  });
});
