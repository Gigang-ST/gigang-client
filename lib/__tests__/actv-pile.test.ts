import { describe, expect, it } from "vitest";

import { PILE_MIN_D, PILE_MAX_D, pileAvatars, scoreToDiameter } from "@/lib/actv-pile";

import type { StoryActvRankEntry } from "@/lib/queries/story-feed";

/**
 * 활동량 무더기 패킹 검증 — `lib/actv-pile.ts`가 순수 함수로 떼어진 취지대로, "겹치지
 * 않는다·넘치지 않는다·같은 입력이면 같은 배치"를 눈이 아니라 수치로 확인한다.
 */

/** i번째 크루원 — 점수는 넘긴 값, id는 안정적으로(배치 시드가 id 기반이라) */
function entry(i: number, score: number): StoryActvRankEntry {
  return {
    rank: i + 1,
    mem_id: `mem-${i}`,
    mem_nm: `러너${i}`,
    avatar_url: null,
    actv_score: score,
  };
}

/** 다양한 점수 분포의 표본 — 최고점·중간·최저점이 섞이게 */
function sample(n: number): StoryActvRankEntry[] {
  return Array.from({ length: n }, (_, i) => entry(i, ((i * 37) % 100) + 1));
}

describe("scoreToDiameter", () => {
  it("점수가 없거나 최대가 0이면 하한 지름", () => {
    expect(scoreToDiameter(0, 0)).toBe(PILE_MIN_D);
    expect(scoreToDiameter(5, 0)).toBe(PILE_MIN_D);
  });

  it("최고점은 상한, 최저(0)는 하한, 중간은 그 사이", () => {
    expect(scoreToDiameter(100, 100)).toBe(PILE_MAX_D);
    expect(scoreToDiameter(0, 100)).toBe(PILE_MIN_D);
    const mid = scoreToDiameter(50, 100);
    expect(mid).toBeGreaterThan(PILE_MIN_D);
    expect(mid).toBeLessThan(PILE_MAX_D);
  });

  it("음수·초과 점수도 [하한, 상한]으로 클램프", () => {
    expect(scoreToDiameter(-10, 100)).toBe(PILE_MIN_D);
    expect(scoreToDiameter(200, 100)).toBe(PILE_MAX_D);
  });
});

describe("pileAvatars", () => {
  it("빈 입력·폭 0이면 빈 배치", () => {
    expect(pileAvatars([], 360)).toEqual({ items: [], height: 0 });
    expect(pileAvatars(sample(3), 0)).toEqual({ items: [], height: 0 });
  });

  it("모든 원이 컨테이너 폭 안에 든다(좌우로 넘치지 않는다)", () => {
    const width = 360;
    const { items } = pileAvatars(sample(40), width);
    for (const it of items) {
      const r = it.d / 2;
      expect(it.x - r).toBeGreaterThanOrEqual(0);
      expect(it.x + r).toBeLessThanOrEqual(width);
    }
  });

  it("어떤 두 원도 서로 겹치지 않는다(중심 거리 ≥ 반지름 합)", () => {
    const { items } = pileAvatars(sample(40), 360);
    for (let a = 0; a < items.length; a += 1) {
      for (let b = a + 1; b < items.length; b += 1) {
        const dx = items[a].x - items[b].x;
        const dy = items[a].y - items[b].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = items[a].d / 2 + items[b].d / 2;
        // 부동소수 오차를 감안해 아주 작은 여유(0.01px)를 둔다
        expect(dist).toBeGreaterThanOrEqual(minDist - 0.01);
      }
    }
  });

  it("같은 입력이면 같은 배치(결정적)", () => {
    const input = sample(20);
    const a = pileAvatars(input, 360);
    const b = pileAvatars(input, 360);
    expect(a).toEqual(b);
  });

  it("입력 배열을 변형하지 않는다(props 보호)", () => {
    const input = sample(10);
    const snapshot = input.map((e) => e.mem_id);
    pileAvatars(input, 360);
    expect(input.map((e) => e.mem_id)).toEqual(snapshot);
  });
});
