import { describe, expect, it } from "vitest";

import { mergeTeamEffects } from "@/lib/team-effects";

const BASE = [
  { effect_cd: "badge-a", effect_nm: "A", rarity_level: 3, use_yn: true, unlock_cond_json: { type: "rarity", level: 3 } },
  { effect_cd: "badge-b", effect_nm: "B", rarity_level: 5, use_yn: true, unlock_cond_json: null },
];

describe("mergeTeamEffects — 팀별 이펙트 설정", () => {
  it("팀 행이 있으면 그 팀 값(등급·사용 여부·해금 조건)을 쓴다", () => {
    const out = mergeTeamEffects(BASE, [
      { effect_cd: "badge-a", rarity_level: 7, use_yn: false, unlock_cond_json: { type: "title", ttl_nm: "산신령" } },
    ]);
    expect(out[0]).toEqual({
      effect_cd: "badge-a",
      effect_nm: "A",
      rarity_level: 7,
      use_yn: false,
      unlock_cond_json: { type: "title", ttl_nm: "산신령" },
    });
  });

  it("팀 행이 없는 이펙트는 공용 기본값 그대로 — 목록에서 빠지지 않는다", () => {
    const out = mergeTeamEffects(BASE, []);
    expect(out).toEqual(BASE);
  });

  it("해금 조건을 '없음(null)'으로 둔 팀 값도 기본값으로 되돌아가지 않는다", () => {
    const out = mergeTeamEffects(BASE, [{ effect_cd: "badge-a", rarity_level: 3, use_yn: true, unlock_cond_json: null }]);
    expect(out[0].unlock_cond_json).toBeNull();
  });
});
