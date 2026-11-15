import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key" },
}));

import { actorHeaders } from "@/lib/supabase/admin";

/**
 * 변경 이력 행위자 헤더 — 이름이 DB 트리거(`chg_hist_capture`,
 * supabase/migrations/20261109140000_chg_hist.sql)가 읽는 것과 **글자 그대로** 같아야 한다.
 * 한쪽만 바꾸면 이력은 계속 쌓이는데 "누가"만 조용히 비어 아무도 눈치채지 못한다.
 */
describe("actorHeaders", () => {
  it("트리거가 읽는 헤더 이름으로 싣는다", () => {
    expect(actorHeaders({ memId: "m-1", teamId: "t-1" })).toEqual({
      "x-gg-actor-mem-id": "m-1",
      "x-gg-actor-team-id": "t-1",
    });
  });
});
