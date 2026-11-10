import { describe, expect, it } from "vitest";

import { stripTitlesIfOff, withoutTitle } from "@/lib/team-titles";

/**
 * 칭호 기능을 끈 팀 — 캐시돼 온 칭호를 화면에 넘기기 직전에 걷는다(대표 칭호·이펙트·프레임).
 */
describe("withoutTitle", () => {
  it("대표 칭호를 비우고 이펙트·프레임을 없음으로 내린다", () => {
    const row = {
      mem_id: "m1",
      primary_title: { ttl_nm: "뉴비", ttl_desc: null },
      badge_effect: "glitch",
      frame_cd: "frame-rainbow",
    };
    expect(withoutTitle(row)).toEqual({ mem_id: "m1", primary_title: null, badge_effect: "none", frame_cd: "frame-none" });
  });

  it("원래 없던 칸은 새로 만들지 않는다 — 응답 모양을 바꾸지 않게", () => {
    const bare: { mem_id: string; primary_title?: unknown } = { mem_id: "m1" };
    expect(withoutTitle(bare)).toEqual({ mem_id: "m1" });
  });
});

describe("stripTitlesIfOff", () => {
  const rows = [{ primary_title: { ttl_nm: "뉴비" }, badge_effect: "glitch" }];

  it("켠 팀은 그대로", () => {
    expect(stripTitlesIfOff(rows, true)).toBe(rows);
  });

  it("끈 팀은 모두 걷는다", () => {
    expect(stripTitlesIfOff(rows, false)).toEqual([{ primary_title: null, badge_effect: "none" }]);
  });
});
