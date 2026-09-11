import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WaitConfirmBody } from "@/components/schedule/wait-confirm-dialog";

const html = (openToAll: boolean) =>
  renderToStaticMarkup(createElement(WaitConfirmBody, { openToAll }));

describe("WaitConfirmBody — 2시간 전까지(대기)", () => {
  it("자동 참석된다는 사실을 먼저 말한다", () => {
    expect(html(false)).toContain("참석자가 취소하면 순번대로 자동 참석됩니다.");
  });

  it("참석이 어려우면 본인이 빼야 한다고 알린다", () => {
    expect(html(false)).toContain("참석이 어려우면 미리 대기를 취소해주세요.");
  });

  it("2시간 경계 이후 규칙도 미리 알린다", () => {
    const out = html(false);
    expect(out).toContain("시작 2시간 전부터는 대기 순번이 없고 선착순으로 바뀝니다.");
    expect(out).toContain("이후 빈 자리가 나면 알림을 보내드리니 직접 참석해주세요.");
  });

  it("경고 줄만 굵게 — 네 줄이 같은 무게면 아무것도 안 읽힌다", () => {
    expect(html(false)).toMatch(/font-semibold[^>]*>참석이 어려우면 미리 대기를 취소해주세요\./);
  });

  it("취소 페널티는 적지 않는다 — 신청하는 자리에서 겁주지 않는다", () => {
    const out = html(false);
    expect(out).not.toContain("사유");
    expect(out).not.toContain("5시간");
  });
});

describe("WaitConfirmBody — 2시간 전부터(빈 자리 알림 요청)", () => {
  it("선착순이라는 것과 알림이 간다는 것만 말한다", () => {
    const out = html(true);
    expect(out).toContain("지금은 순번 없이 선착순입니다.");
    expect(out).toContain("빈 자리가 나면 알림을 보내드립니다.");
  });

  it("'대기'라는 말을 쓰지 않는다 — 순번을 기대하게 만들지 않는다", () => {
    expect(html(true)).not.toContain("대기");
  });

  it("자동 참석을 약속하지 않는다", () => {
    expect(html(true)).not.toContain("자동");
  });
});
