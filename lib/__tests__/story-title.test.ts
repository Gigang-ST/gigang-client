import { describe, expect, it } from "vitest";

import {
  TITLE_LEDE_PAGE,
  pickTitleLedeStart,
  rotateTitlePage,
} from "@/lib/story-title";

describe("rotateTitlePage", () => {
  const arr7 = ["a", "b", "c", "d", "e", "f", "g"];

  it("pick 0이면 앞에서 3개", () => {
    expect(rotateTitlePage(arr7, 0)).toEqual(["a", "b", "c"]);
  });

  it("pick만큼 회전해서 3개 — 끝을 넘으면 처음으로 감긴다", () => {
    expect(rotateTitlePage(arr7, 6)).toEqual(["g", "a", "b"]);
  });

  it("step 3 전진이 전 칭호를 커버한다 — 셔플의 굶주림이 구조적으로 불가능", () => {
    // 한 바퀴마다 pick += TITLE_LEDE_PAGE(§story-lede rerollAllPicks). 어떤 길이든
    // 몇 바퀴 안에 모든 원소가 지면에 오른다(스펙 §회전 규칙).
    for (const len of [1, 2, 3, 4, 5, 6, 7, 10]) {
      const arr = Array.from({ length: len }, (_, i) => i);
      const seen = new Set<number>();
      for (let cycle = 0; cycle < len; cycle++) {
        for (const v of rotateTitlePage(arr, cycle * TITLE_LEDE_PAGE)) seen.add(v);
      }
      expect([...seen].sort((a, b) => a - b)).toEqual(arr);
    }
  });

  it("pool이 3개 이하면 전부, 빈 배열이면 빈 배열", () => {
    expect(rotateTitlePage(["a", "b"], 5)).toEqual(
      expect.arrayContaining(["a", "b"]),
    );
    expect(rotateTitlePage(["a", "b"], 5)).toHaveLength(2);
    expect(rotateTitlePage([], 3)).toEqual([]);
  });

  it("음수 pick도 안전하다(기존 rotate와 같은 방어)", () => {
    expect(rotateTitlePage(arr7, -1)).toHaveLength(3);
  });
});

describe("pickTitleLedeStart", () => {
  it("0·1개면 항상 0", () => {
    expect(pickTitleLedeStart(0)).toBe(0);
    expect(pickTitleLedeStart(1)).toBe(0);
  });

  it("범위는 항상 [0, count)", () => {
    for (let i = 0; i < 50; i++) {
      const v = pickTitleLedeStart(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
});
