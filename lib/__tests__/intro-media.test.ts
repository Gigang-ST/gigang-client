import { describe, expect, it } from "vitest";

import { LINE_MEDIA } from "@/lib/intro/media.generated";
import {
  BURST_FRAMES,
  LINE_FILES,
  LINE_FRAMES,
  LOGO_MARK,
  nextReadyFrame,
  planIntroMedia,
} from "@/lib/intro/media";

describe("인트로 사진 목록(빌드 생성)", () => {
  it("문장 배경 파일이 전부 폴더에 있고 내용 해시가 붙는다", () => {
    for (const file of LINE_FILES) expect(LINE_MEDIA[file]).toBeDefined();
    for (const src of LINE_FRAMES) expect(src).toMatch(/\?v=[0-9a-f]{10}$/);
  });

  it("버스트 프레임이 있고 전부 내용 해시가 붙는다", () => {
    expect(BURST_FRAMES.length).toBeGreaterThan(0);
    for (const src of BURST_FRAMES) {
      expect(src).toMatch(/^\/crew\/frames\/[^/]+\?v=[0-9a-f]{10}$/);
    }
  });
});

describe("planIntroMedia — 스플래시가 기다리는 것", () => {
  const burst = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("문장 배경·로고·앞 N장·마지막 장만 기다리고 나머지는 뒤로 미룬다", () => {
    const { critical, deferred } = planIntroMedia(burst, 3);
    expect(critical).toEqual([...LINE_FRAMES, LOGO_MARK, "a", "b", "c", "h"]);
    expect(deferred).toEqual(["d", "e", "f", "g"]);
  });

  it("프레임이 적으면 마지막 장을 두 번 넣지 않는다", () => {
    const { critical, deferred } = planIntroMedia(["a", "b"], 6);
    expect(critical.filter((s) => s === "b")).toHaveLength(1);
    expect(deferred).toEqual([]);
  });

  it("빈 폴더여도 깨지지 않는다", () => {
    expect(planIntroMedia([], 6)).toEqual({
      critical: [...LINE_FRAMES, LOGO_MARK],
      deferred: [],
    });
  });
});

describe("nextReadyFrame — 못 받은 프레임은 건너뛴다", () => {
  const frames = ["a", "b", "c", "d"];

  it("받은 다음 장으로 간다", () => {
    expect(nextReadyFrame(frames, 0, new Set(["a", "b", "c", "d"]))).toBe(1);
  });

  it("아직 못 받은 장은 건너뛴다", () => {
    expect(nextReadyFrame(frames, 0, new Set(["a", "c", "d"]))).toBe(2);
  });

  it("마지막 장은 못 받았어도 착지한다 — 연출이 멈추지 않게", () => {
    expect(nextReadyFrame(frames, 0, new Set(["a"]))).toBe(3);
  });

  it("마지막 장 다음은 끝(-1)", () => {
    expect(nextReadyFrame(frames, 3, new Set(frames))).toBe(-1);
  });
});
