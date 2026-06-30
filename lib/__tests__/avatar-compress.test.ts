import { describe, it, expect } from "vitest";
import {
  shouldCompressInBrowser,
  computeCoverCrop,
  AVATAR_TARGET_PX,
} from "@/lib/image/avatar-compress";

describe("shouldCompressInBrowser", () => {
  it("JPG·PNG·WebP는 true", () => {
    expect(shouldCompressInBrowser("image/jpeg")).toBe(true);
    expect(shouldCompressInBrowser("image/png")).toBe(true);
    expect(shouldCompressInBrowser("image/webp")).toBe(true);
  });
  it("HEIC·HEIF는 false (서버 변환)", () => {
    expect(shouldCompressInBrowser("image/heic")).toBe(false);
    expect(shouldCompressInBrowser("image/heif")).toBe(false);
  });
  it("알 수 없는 타입은 false", () => {
    expect(shouldCompressInBrowser("")).toBe(false);
    expect(shouldCompressInBrowser("image/gif")).toBe(false);
  });
});

describe("computeCoverCrop", () => {
  it("정사각형은 전체 사용", () => {
    expect(computeCoverCrop(100, 100)).toEqual({ sx: 0, sy: 0, side: 100 });
  });
  it("가로가 길면 좌우를 잘라 가운데 정사각형", () => {
    expect(computeCoverCrop(200, 100)).toEqual({ sx: 50, sy: 0, side: 100 });
  });
  it("세로가 길면 위아래를 잘라 가운데 정사각형", () => {
    expect(computeCoverCrop(100, 200)).toEqual({ sx: 0, sy: 50, side: 100 });
  });
  it("홀수 차이는 내림", () => {
    expect(computeCoverCrop(101, 100)).toEqual({ sx: 0, sy: 0, side: 100 });
  });
});

describe("AVATAR_TARGET_PX", () => {
  it("512", () => expect(AVATAR_TARGET_PX).toBe(512));
});
