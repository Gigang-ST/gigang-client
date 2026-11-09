import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { cfgStatus } from "@/lib/team-cfg/form";
import { TEAM_CFG_REGISTRY, type TeamCfgCd } from "@/lib/team-cfg/registry";

/**
 * 「팀 설정」 렌더 — 사전의 모든 키가 묶음별로 올라오는지, 상태가 보이는지, 비밀값이 화면에 안 실리는지.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/actions/admin/team-settings", () => ({
  saveTeamSetting: async () => ({ ok: true, message: null }),
  resetTeamSetting: async () => ({ ok: true, message: null }),
}));

const { TeamSettingsClient } = await import("@/app/(info)/admin/team-settings/team-settings-client");

const text = (html: string) => html.replace(/<[^>]+>/g, " ");

/** 서버 페이지와 같은 방식으로 항목을 만든다 — 모두 "안 정함" */
function itemsFor(overrides: Partial<Record<TeamCfgCd, unknown>> = {}) {
  return (Object.keys(TEAM_CFG_REGISTRY) as TeamCfgCd[]).map((cd) => {
    const def = TEAM_CFG_REGISTRY[cd];
    const isSet = cd in overrides;
    return {
      cd,
      label: def.label,
      description: def.description,
      group: def.group,
      input: def.input,
      status: cfgStatus(isSet, def.default),
      value: def.input.kind === "secret" ? null : isSet ? overrides[cd] : def.default,
    };
  });
}

function render(items = itemsFor()) {
  return renderToStaticMarkup(
    createElement(TeamSettingsClient, { items, otherTeams: [{ teamCd: "ulsan", teamNm: "울산지부" }] }),
  );
}

describe("팀 설정 화면", () => {
  it("사전의 모든 키가 이름으로 올라온다", () => {
    const t = text(render());
    for (const def of Object.values(TEAM_CFG_REGISTRY)) expect(t).toContain(def.label);
  });

  it("묶음 이름이 순서대로 선다", () => {
    const t = text(render());
    const order = ["기능", "크루 표기", "채널·계좌", "템플릿·안내", "비밀값"].map((l) => t.indexOf(l));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("상태: 회비는 기본값, 워드마크는 설정 안 함, 정한 값은 이 팀 설정 + 기본값으로 버튼", () => {
    const t = text(render(itemsFor({ "brand.wordmark": "GIGANG" })));
    expect(t).toContain("기본값");
    expect(t).toContain("설정 안 함");
    expect(t).toContain("이 팀 설정");
    expect(t).toContain("기본값으로");
  });

  it("비밀값은 화면에 값이 실리지 않는다 — 설정돼 있다는 안내만", () => {
    const items = itemsFor({ "social.kakao_open_chat_password": "secret-1234" }).map((i) =>
      // 서버 페이지는 비밀값 value 를 null 로 보낸다 — 실수로 실려도 화면이 그리지 않는지 함께 본다
      i.cd === "social.kakao_open_chat_password" ? { ...i, value: "secret-1234" } : i,
    );
    const html = render(items);
    expect(html).not.toContain("secret-1234");
    expect(text(html)).toContain("이 팀 설정");
  });
});
