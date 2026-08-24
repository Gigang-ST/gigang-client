import { describe, it, expect } from "vitest";

import { DEFAULT_BACK_HREF, resolveBackAction } from "@/lib/back-nav";

describe("뒤로가기 판정 (#450)", () => {
  describe("canGoBack 이 있으면 그것만 믿는다", () => {
    it("뒤에 항목이 있으면 진짜 뒤로", () => {
      expect(resolveBackAction({ canGoBack: true, historyLength: 1 }, "/settings")).toEqual({
        type: "back",
      });
    });

    it("뒤가 비었으면 길이가 얼마든 폴백", () => {
      expect(resolveBackAction({ canGoBack: false, historyLength: 9 }, "/settings")).toEqual({
        type: "replace",
        href: "/settings",
      });
    });

    it("첫 항목으로 되돌아온 상태 — 앞으로만 항목이 있어 length 는 2지만 뒤는 비었다", () => {
      // /board 직접 진입(1) → 글로 이동(2) → 브라우저 뒤로(현재 0번, length 그대로 2).
      // 길이만 보면 "뒤가 있다"로 오판하는 자리 — canGoBack 이 이걸 바로잡는다.
      expect(resolveBackAction({ canGoBack: false, historyLength: 2 }, "/board")).toEqual({
        type: "replace",
        href: "/board",
      });
    });
  });

  describe("canGoBack 이 없으면 길이로 어림한다", () => {
    it("히스토리가 이 문서 하나뿐이면 폴백 — router.back()이 조용히 죽는 자리", () => {
      expect(resolveBackAction({ historyLength: 1 }, "/settings")).toEqual({
        type: "replace",
        href: "/settings",
      });
    });

    it("돌아갈 항목이 있으면 뒤로", () => {
      expect(resolveBackAction({ historyLength: 2 }, "/settings")).toEqual({ type: "back" });
      expect(resolveBackAction({ historyLength: 17 }, "/settings")).toEqual({ type: "back" });
    });

    it("0도 폴백 — 이론상 안 나오지만 back()이 못 가는 건 마찬가지다", () => {
      expect(resolveBackAction({ historyLength: 0 }, "/")).toEqual({ type: "replace", href: "/" });
    });

    it("⚠️ 알려진 구멍 — 첫 항목으로 되돌아온 상태를 길이만으로는 못 가린다", () => {
      // 위 canGoBack:false 케이스와 같은 상황인데, 지원 안 되는 브라우저에서는
      // back()으로 판정된다. 고치려면 Next 내부 히스토리 처리에 손대야 해서 남겨 둔다.
      // 지금보다 나빠지지 않고, 지원되는 곳에서는 정확하다.
      expect(resolveBackAction({ historyLength: 2 }, "/board")).toEqual({ type: "back" });
    });
  });

  it("폴백 경로를 그대로 실어 보낸다 — 화면마다 다른 곳으로 빠질 수 있어야 한다", () => {
    expect(resolveBackAction({ historyLength: 1 }, "/board")).toEqual({
      type: "replace",
      href: "/board",
    });
    expect(resolveBackAction({ historyLength: 1 }, "/board/abc")).toEqual({
      type: "replace",
      href: "/board/abc",
    });
  });

  it("기본 폴백은 어느 화면에서든 안전한 지면", () => {
    expect(DEFAULT_BACK_HREF).toBe("/");
    expect(resolveBackAction({ historyLength: 1 }, DEFAULT_BACK_HREF)).toEqual({
      type: "replace",
      href: "/",
    });
  });
});
