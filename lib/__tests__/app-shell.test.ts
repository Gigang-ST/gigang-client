import { describe, expect, it } from "vitest";

import {
  APP_WIDTHS,
  APP_WIDTH_DEFAULT,
  readStoredWidth,
  resolveShellWidth,
  shellWidthBootScript,
} from "@/lib/app-shell";

/**
 * 셸 폭 — 첫 페인트 전 인라인 스크립트와 마운트 후 컴포넌트가 **같은 규칙**인지 못박는다.
 *
 * 이 둘이 갈리면 새로고침 때 폭이 한 번 튄다. 스크립트가 존재하는 이유가 바로 그 점프를
 * 없애는 것이라, 갈리는 순간 기능이 자기 목적을 배반한다. 실제로 한 번 갈렸다 —
 * 스크립트가 저장값의 진위(`Number(...)||기본값`)만 보고 `APP_WIDTHS` 포함 여부를 안 봐서,
 * 목록에 없는 값이 남아 있으면 스크립트는 그대로 적용하고 컴포넌트는 기본값으로 되돌렸다.
 */

/** 인라인 스크립트를 실제로 굴려 DOM에 무엇을 썼는지 읽는다. */
function runBootScript(stored: string | null, viewport: number) {
  const style: Record<string, string> = {};
  const attrs: Record<string, string> = {};
  const documentStub = {
    documentElement: {
      style: {
        setProperty: (k: string, v: string) => {
          style[k] = v;
        },
      },
      setAttribute: (k: string, v: string) => {
        attrs[k] = v;
      },
    },
  };

  new Function("document", "window", "localStorage", shellWidthBootScript)(
    documentStub,
    { innerWidth: viewport },
    { getItem: () => stored },
  );

  return { width: style["--app-max-w"], inset: "data-shell-inset" in attrs };
}

/** 컴포넌트 쪽 경로 — `readStoredWidth()`는 window.localStorage를 본다. */
function runComponent(stored: string | null, viewport: number) {
  const prev = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem: () => stored },
  };
  try {
    const resolved = resolveShellWidth(readStoredWidth(), viewport);
    return { width: `${resolved.width}px`, inset: resolved.inset };
  } finally {
    (globalThis as { window?: unknown }).window = prev;
  }
}

const STORED = [
  null,
  ...APP_WIDTHS.map(String),
  "500", // 목록에 없는 값 — 옛 버전 잔재·수동 조작
  "abc", // 숫자가 아님
  "0",
  "-1",
];
const VIEWPORTS = [375, 480, 500, 575, 576, 620, 800, 1200];

describe("셸 폭 — 인라인 스크립트 ↔ 컴포넌트", () => {
  it.each(STORED)("저장값 %s 에서 두 경로가 모든 뷰포트에서 같은 결과를 낸다", (stored) => {
    for (const viewport of VIEWPORTS) {
      expect(runBootScript(stored, viewport), `viewport=${viewport}`).toEqual(
        runComponent(stored, viewport),
      );
    }
  });

  it("APP_WIDTHS에 없는 저장값은 양쪽 다 기본 폭으로 되돌린다", () => {
    expect(runBootScript("500", 1200).width).toBe(`${APP_WIDTH_DEFAULT}px`);
    expect(runBootScript("abc", 1200).width).toBe(`${APP_WIDTH_DEFAULT}px`);
  });
});

describe("resolveShellWidth", () => {
  it("지면이 안 남는 폭(=폰)에서는 셸을 갈라 보이지 않는다", () => {
    expect(resolveShellWidth(APP_WIDTH_DEFAULT, 375).inset).toBe(false);
    expect(resolveShellWidth(APP_WIDTH_DEFAULT, 575).inset).toBe(false);
    expect(resolveShellWidth(APP_WIDTH_DEFAULT, 576).inset).toBe(true);
  });

  it("창이 좁아지면 보이는 폭만 깎이고, 다시 넓히면 고른 값으로 돌아온다", () => {
    // 800이 온전히 나오려면 800+120=920px가 필요하다. 그 아래선 여백을 지키느라 깎인다.
    expect(resolveShellWidth(800, 920).width).toBe(800);
    expect(resolveShellWidth(800, 900).width).toBe(780);
    expect(resolveShellWidth(800, 620).width).toBe(500);
    // 저장값은 안 건드리므로 창을 도로 넓히면 그대로 복구된다.
    expect(resolveShellWidth(800, 920).width).toBe(800);
  });

  it("깎여도 기본 폭 아래로는 안 내려간다", () => {
    for (const viewport of VIEWPORTS.filter((v) => v >= 576)) {
      expect(resolveShellWidth(800, viewport).width).toBeGreaterThanOrEqual(
        APP_WIDTH_DEFAULT,
      );
    }
  });

  it("지면이 켜질 땐 레일(약 36px)이 들어갈 폭이 항상 남는다", () => {
    // GUTTER_MIN(96)과 CONTROL_ROOM(120)이 다른 값이라 576~600 구간이 가장 빠듯하다.
    for (const viewport of [576, 580, 600, 620, 700, 1200]) {
      const { width, inset } = resolveShellWidth(800, viewport);
      expect(inset).toBe(true);
      expect((viewport - width) / 2).toBeGreaterThanOrEqual(44);
    }
  });
});
