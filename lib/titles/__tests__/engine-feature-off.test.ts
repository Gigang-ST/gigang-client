import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase } from "@/app/api/mcp/__tests__/fake-supabase";

/**
 * 칭호 기능을 끈 팀(feature.titles=false, 울산) — 자동 수여가 멈춘다.
 * 실시간 평가(evaluateAndGrantTitles)와 배치가 모두 `loadAutoTitles` 를 거치므로 여기서 멈추는지만 지키면 둘 다 멈춘다.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  titlesOn: true as boolean | Error,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db.asClient() }));
vi.mock("@/lib/notifications/insert-noti", () => ({ insertNoti: vi.fn() }));
vi.mock("@/lib/team-cfg/read", () => ({
  getTeamCfgStrict: vi.fn(async () => {
    if (h.titlesOn instanceof Error) throw h.titlesOn;
    return h.titlesOn;
  }),
}));

const { evaluateAndGrantTitles, loadAutoTitles } = await import("@/lib/titles/engine");

const TEAM = "team-a";
const TITLE = {
  ttl_id: "ttl-1",
  team_id: TEAM,
  ttl_nm: "뉴비",
  ttl_kind_enm: "auto",
  use_yn: true,
  vers: 0,
  del_yn: false,
  cond_rule_json: { type: "join_days", days: 0 },
  eff_stt_dt: null,
};

beforeEach(() => {
  h.titlesOn = true;
  h.db = new FakeSupabase({
    ttl_mst: [TITLE],
    team_mem_rel: [{ team_mem_id: "tm-1", mem_id: "mem-1", team_id: TEAM, vers: 0, del_yn: false }],
    mem_ttl_rel: [],
  });
});

describe("loadAutoTitles — 칭호 기능 켬/끔", () => {
  it("켠 팀은 그 팀의 자동 칭호를 읽는다", async () => {
    await expect(loadAutoTitles(h.db.asClient(), TEAM)).resolves.toHaveLength(1);
  });

  it("끈 팀은 빈 목록이고 칭호 목록을 읽지도 않는다", async () => {
    h.titlesOn = false;
    await expect(loadAutoTitles(h.db.asClient(), TEAM)).resolves.toEqual([]);
    expect(h.db.opsOn("ttl_mst")).toHaveLength(0);
  });

  it("설정을 못 읽으면 던진다 — 빈 목록으로 넘기면 배치가 '성공'으로 끝나 그 기간 수여가 빠진다", async () => {
    h.titlesOn = new Error("팀 설정 조회 실패");
    await expect(loadAutoTitles(h.db.asClient(), TEAM)).rejects.toThrow("팀 설정 조회 실패");
  });
});

describe("evaluateAndGrantTitles — 칭호 기능을 끈 팀", () => {
  it("아무 칭호도 주지 않는다(수여 행이 안 생긴다)", async () => {
    h.titlesOn = false;
    await expect(evaluateAndGrantTitles({ trigger: "attendance", teamId: TEAM, teamMemId: "tm-1" })).resolves.toEqual([]);
    expect(h.db.opsOn("mem_ttl_rel", "insert")).toHaveLength(0);
    // 평가할 칭호를 아예 안 읽는다 — 이게 0이어야 "조건이 안 맞아서"가 아니라 "꺼서" 안 준 것이다
    expect(h.db.opsOn("ttl_mst")).toHaveLength(0);
  });
});
