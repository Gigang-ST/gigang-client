import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GuideMarkdown } from "@/components/common/guide-markdown";
import { GIGANG_NEWBIE_ACTIVITIES, GIGANG_NEWBIE_SECTIONS } from "@/lib/__fixtures__/gigang-newbie-guide";
import { guideActivitiesSchema, guideSectionsSchema, visibleGuideSections } from "@/lib/newbie-guide";

/** 신입 안내 팀 설정(#748) — 기강 문구 이전 · 형식 · 마크다운 모양 */
describe("기강 신입 안내 — 마이그레이션 값", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261123110000_newbie_guide_cfg.sql"), "utf8");
  /** `$tag$ … $tag$` 사이 JSON */
  const between = (tag: string) => {
    const open = `$${tag}$`;
    const start = sql.indexOf(open);
    const end = sql.indexOf(open, start + open.length);
    if (start < 0 || end < 0) throw new Error(`${tag} 값을 못 찾음`);
    return JSON.parse(sql.slice(start + open.length, end));
  };

  it("마이그레이션이 넣는 값이 고정 자료와 같다(한쪽만 고치면 깨진다)", () => {
    expect(between("activities")).toEqual(GIGANG_NEWBIE_ACTIVITIES);
    expect(between("sections")).toEqual(GIGANG_NEWBIE_SECTIONS);
  });

  it("형식 검사를 통과한다 — 안 그러면 읽을 때 기본값(빈 목록)으로 떨어져 기강 안내가 사라진다", () => {
    expect(guideActivitiesSchema.safeParse(GIGANG_NEWBIE_ACTIVITIES).success).toBe(true);
    expect(guideSectionsSchema.safeParse(GIGANG_NEWBIE_SECTIONS).success).toBe(true);
  });
});

describe("visibleGuideSections", () => {
  it("숨긴 칸과 본문이 빈 칸은 화면에 안 세운다", () => {
    const rows = visibleGuideSections([
      { title: "보임", icon: "info", body: "내용", visible: true },
      { title: "숨김", icon: "info", body: "내용", visible: false },
      { title: "빈 칸", icon: "info", body: "  ", visible: true },
    ]);
    expect(rows.map((r) => r.title)).toEqual(["보임"]);
  });
});

describe("GuideMarkdown — 예전 손으로 짠 모양", () => {
  const html = (body: string) => renderToStaticMarkup(createElement(GuideMarkdown, { body }));

  it("엔터 한 번이 줄바꿈이 된다(표준 마크다운은 한 줄로 붙인다)", () => {
    // react-markdown 은 <br/> 뒤에 줄바꿈 글자를 하나 붙인다(화면엔 안 보인다)
    expect(html("첫 줄\n둘째 줄")).toMatch(/첫 줄<br\/>\s*둘째 줄/);
  });

  it("물결 하나는 취소선이 아니다 — 「60~70%」", () => {
    const out = html("최대 심박수의 60~70% → 유산소 구간\n최대 심박수의 80~90%");
    expect(out).not.toContain("<del>");
    expect(out).toContain("60~70%");
  });

  it("굵게·표·목록이 그려진다(기강 러닝팁 등급표)", () => {
    const tip = GIGANG_NEWBIE_SECTIONS.find((s) => s.icon === "tip")!.body;
    const out = html(tip);
    expect(out).toContain("<table");
    expect(out).toContain("최고존엄");
    expect(out).toContain("<ul");
    expect(out).toContain('<span class="font-bold text-foreground">Easy</span>');
  });

  it("HTML 은 그리지 않는다 — 운영진 입력이 스크립트가 되지 않게", () => {
    const out = html('<script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
  });

  it("javascript: 링크는 걸러진다", () => {
    expect(html("[눌러](javascript:alert(1))")).not.toContain("javascript:");
  });
});
