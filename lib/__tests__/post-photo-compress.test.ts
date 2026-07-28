import { describe, it, expect } from "vitest";
import {
  computeFitInside,
  shouldCompressInBrowser,
  PHOTO_MAX_HEIGHT,
  PHOTO_MAX_WIDTH,
  PHOTO_QUALITY,
} from "@/lib/image/post-photo-compress";

describe("shouldCompressInBrowser", () => {
  it("JPG·PNG·WebP는 true", () => {
    expect(shouldCompressInBrowser("image/jpeg")).toBe(true);
    expect(shouldCompressInBrowser("image/png")).toBe(true);
    expect(shouldCompressInBrowser("image/webp")).toBe(true);
  });

  it("HEIC·HEIF는 false — canvas가 못 읽어 서버가 변환한다", () => {
    expect(shouldCompressInBrowser("image/heic")).toBe(false);
    expect(shouldCompressInBrowser("image/heif")).toBe(false);
  });

  it("알 수 없는 타입은 false", () => {
    expect(shouldCompressInBrowser("")).toBe(false);
    expect(shouldCompressInBrowser("application/pdf")).toBe(false);
  });
});

/**
 * 이 계산은 서버 sharp의 `fit: "inside"` + `withoutEnlargement: true`와 **한 치도 달라선
 * 안 된다**. 어긋나면 브라우저가 줄여 보낸 사진을 서버가 한 번 더 축소해 손실이 겹친다.
 * 기대값은 실제 sharp 출력과 대조해 얻은 것이다.
 */
describe("computeFitInside", () => {
  it("아이폰 12MP 가로 — 폭에 걸려 1080x810", () => {
    expect(computeFitInside(4032, 3024)).toEqual({ width: 1080, height: 810 });
  });

  it("아이폰 12MP 세로 — 폭에 걸려 1080x1440(높이 상한엔 안 걸린다)", () => {
    expect(computeFitInside(3024, 4032)).toEqual({ width: 1080, height: 1440 });
  });

  it("정사각 4000 → 1080x1080", () => {
    expect(computeFitInside(4000, 4000)).toEqual({ width: 1080, height: 1080 });
  });

  it("세로 파노라마는 높이 상한이 먼저 걸린다", () => {
    expect(computeFitInside(1200, 8000)).toEqual({ width: 288, height: 1920 });
  });

  it("가로 파노라마는 폭 상한이 먼저 걸린다", () => {
    expect(computeFitInside(8000, 1200)).toEqual({ width: 1080, height: 162 });
  });

  it("이미 규격이면 그대로 — 재축소하지 않는다", () => {
    expect(computeFitInside(1080, 1920)).toEqual({ width: 1080, height: 1920 });
  });

  it("상한보다 작으면 확대하지 않는다(withoutEnlargement)", () => {
    expect(computeFitInside(800, 600)).toEqual({ width: 800, height: 600 });
    expect(computeFitInside(1, 1)).toEqual({ width: 1, height: 1 });
  });

  it("결과는 항상 상한 안에 들어간다", () => {
    for (const [w, h] of [
      [4032, 3024],
      [3024, 4032],
      [8000, 1200],
      [1200, 8000],
      [5000, 5000],
      [1081, 1921],
    ]) {
      const out = computeFitInside(w, h);
      expect(out.width).toBeLessThanOrEqual(PHOTO_MAX_WIDTH);
      expect(out.height).toBeLessThanOrEqual(PHOTO_MAX_HEIGHT);
    }
  });

  it("비율을 유지한다(크롭이 아니다)", () => {
    const out = computeFitInside(4032, 3024);
    expect(out.width / out.height).toBeCloseTo(4032 / 3024, 2);
  });

  it("0·음수는 그대로 돌려준다(계산 불가 — 나눗셈 폭주 방지)", () => {
    expect(computeFitInside(0, 100)).toEqual({ width: 0, height: 100 });
    expect(computeFitInside(-5, 10)).toEqual({ width: -5, height: 10 });
  });
});

describe("규격 상수", () => {
  it("인스타 스토리 규격 1080x1920 · 품질 90", () => {
    expect(PHOTO_MAX_WIDTH).toBe(1080);
    expect(PHOTO_MAX_HEIGHT).toBe(1920);
    expect(PHOTO_QUALITY).toBe(90);
  });

  it("canvas.toBlob에 넘길 0~1 품질로 환산된다", () => {
    expect(PHOTO_QUALITY / 100).toBeCloseTo(0.9, 5);
  });
});
