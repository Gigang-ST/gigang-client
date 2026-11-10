import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { cfgStatus, compareCfgOrder, summarizeCfg } from "@/lib/team-cfg/form";
import { TEAM_CFG_REGISTRY, type TeamCfgCd } from "@/lib/team-cfg/registry";

/**
 * 「팀 설정」 렌더 — 요약 목록(한 줄 = 이름 + 지금 값 요약). 사전의 키가 중요도 묶음 순서로 올라오는지,
 * 숨긴 키는 안 올라오는지, 비밀값이 목록에 실리지 않는지. (편집 시트는 눌러야 열려 정적 렌더엔 없다)
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock("@/app/actions/admin/team-settings", () => ({
  saveTeamSetting: async () => ({ ok: true, message: null }),
  resetTeamSetting: async () => ({ ok: true, message: null }),
}));

const { TeamSettingsClient } = await import("@/app/(info)/admin/team-settings/team-settings-client");

const text = (html: string) => html.replace(/<[^>]+>/g, " ");

/** 서버 페이지와 같은 방식으로 항목을 만든다(숨긴 키 빼고, 중요도 순) */
function itemsFor(overrides: Partial<Record<TeamCfgCd, unknown>> = {}) {
  return (Object.keys(TEAM_CFG_REGISTRY) as TeamCfgCd[])
    .filter((cd) => !TEAM_CFG_REGISTRY[cd].hidden)
    .sort(compareCfgOrder)
    .map((cd) => {
      const def = TEAM_CFG_REGISTRY[cd];
      const isSet = cd in overrides;
      const secret = def.input.kind === "secret";
      const current = isSet ? overrides[cd] : def.default;
      return {
        cd,
        label: def.label,
        description: def.description,
        group: def.group,
        input: def.input,
        status: cfgStatus(isSet, def.default),
        value: secret ? null : current,
        summary: summarizeCfg(def.input, isSet, secret ? null : current),
        defaultValue: secret ? null : def.default,
        ownerOnly: Boolean((def as { ownerOnly?: boolean }).ownerOnly),
      };
    });
}

function render(items = itemsFor(), isOwner = true) {
  return renderToStaticMarkup(
    createElement(TeamSettingsClient, { items, otherTeams: [{ teamCd: "ulsan", teamNm: "울산지부" }], isOwner }),
  );
}

describe("팀 설정 화면 — 요약 목록", () => {
  it("숨기지 않은 키는 모두 한 줄씩 올라오고, 숨긴 키(다른 팀 가입 안내)는 안 올라온다", () => {
    const t = text(render());
    for (const def of Object.values(TEAM_CFG_REGISTRY)) {
      if (def.hidden) expect(t).not.toContain(def.label);
      else expect(t).toContain(def.label);
    }
  });

  it("묶음이 팀의 근간부터 선다 — 기본 설정 → 운영 → 크루 안내 → 기능", () => {
    const t = text(render());
    const order = ["기본 설정", "운영", "크루 안내", "기능"].map((l) => t.indexOf(l));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("줄마다 지금 값 요약이 보인다 — 회비 켜짐, 빈 항목은 '설정 안 함', 정한 값은 그 값", () => {
    const t = text(render(itemsFor({ "brand.wordmark": "GIGANG" })));
    expect(t).toContain("켜짐");
    expect(t).toContain("설정 안 함");
    expect(t).toContain("GIGANG");
  });

  it("설명은 목록에 없다 — 눌러서 여는 시트에만", () => {
    const t = text(render());
    expect(t).not.toContain(TEAM_CFG_REGISTRY["brand.wordmark"].description);
  });

  it("비밀값은 목록에 값이 실리지 않는다 — '설정됨'만", () => {
    const items = itemsFor({ "social.kakao_open_chat_password": "secret-1234" }).map((i) =>
      // 서버 페이지는 비밀값 value 를 null 로 보낸다 — 실수로 실려도 화면이 그리지 않는지 함께 본다
      i.cd === "social.kakao_open_chat_password" ? { ...i, value: "secret-1234" } : i,
    );
    const html = render(items);
    expect(html).not.toContain("secret-1234");
    expect(text(html)).toContain("설정됨");
  });

  it("owner 가 아닌 관리자에겐 owner 전용 설정(계좌·카톡방)이 잠겨 보인다 — owner 에겐 안 잠긴다", () => {
    const locked = text(render(itemsFor(), false));
    expect(locked).toContain("owner만 바꿀 수 있어요");
    expect(text(render(itemsFor(), true))).not.toContain("owner만 바꿀 수 있어요");
  });
});
