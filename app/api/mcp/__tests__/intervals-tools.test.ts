import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OperatorContext } from "@/lib/mcp/auth";
import { listMemberWorkouts } from "@/lib/mcp/intervals";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

import { FakeSupabase } from "./fake-supabase";

const TEAM = "22222222-2222-4222-8222-222222222222";
const OTHER_TEAM = "33333333-3333-4333-8333-333333333333";
const ADMIN = "11111111-1111-4111-8111-111111111111";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const M2 = "aaaaaaaa-0000-4000-8000-000000000002";
const M3 = "aaaaaaaa-0000-4000-8000-000000000003";

const ctx = (o: Partial<OperatorContext> = {}): OperatorContext => ({
  mem_id: ADMIN,
  team_id: TEAM,
  is_admin: true,
  mem_nm: "관리자",
  ...o,
});

function setup() {
  const fake = new FakeSupabase({
    mem_mst: [
      { mem_id: M1, mem_nm: "홍길동", del_yn: false },
      { mem_id: M2, mem_nm: "김연결", del_yn: false },
      { mem_id: M3, mem_nm: "다른팀", del_yn: false },
    ],
    team_mem_rel: [
      { mem_id: M1, team_id: TEAM, vers: 0, del_yn: false },
      { mem_id: M2, team_id: TEAM, vers: 0, del_yn: false },
      { mem_id: M3, team_id: OTHER_TEAM, vers: 0, del_yn: false },
    ],
    mem_icu_cnn_rel: [
      { mem_id: M1, team_id: TEAM, api_key_enc: "v1:SECRET:SECRET:SECRET", cnn_stts_cd: "ok", last_ok_at: "2026-11-26T00:00:00Z" },
    ],
    mem_icu_act_hist: [
      { icu_act_id: "a1", mem_id: M1, team_id: TEAM, act_dt: "2026-11-24", sprt_type_nm: "Run", dst_m: 5000, mov_sec: 1500, avg_spd_mps: 3.333 },
      { icu_act_id: "a2", mem_id: M1, team_id: TEAM, act_dt: "2026-11-25", sprt_type_nm: "Ride", dst_m: 30000, mov_sec: 3600, avg_spd_mps: 8.3 },
    ],
  });
  return { db: fake as unknown as SupabaseClient<Database> };
}

describe("list_member_workouts", () => {
  it("admin 이 아니면 거부한다", async () => {
    const { db } = setup();
    await expect(listMemberWorkouts(db, ctx({ is_admin: false }), { memberId: M1 })).rejects.toBeInstanceOf(ToolDeniedError);
  });

  it("요약만 최신순으로 돌려주고 키·암호문은 어디에도 없다", async () => {
    const { db } = setup();
    const res = await listMemberWorkouts(db, ctx(), { memberId: M1 });
    expect(res.connected).toBe(true);
    expect(res.workouts.map((w) => w.date)).toEqual(["2026-11-25", "2026-11-24"]);
    expect(res.workouts[1]).toEqual({
      date: "2026-11-24",
      sport: "Run",
      sport_label: "러닝",
      distance_km: 5,
      duration: "25:00",
      pace: "5:00/km",
    });
    const json = JSON.stringify(res);
    expect(json).not.toContain("SECRET");
    expect(json).not.toContain("api_key");
  });

  it("이름으로 찾고, 연결 안 한 회원은 connected=false", async () => {
    const { db } = setup();
    expect((await listMemberWorkouts(db, ctx(), { name: "홍길동" })).member_id).toBe(M1);
    const none = await listMemberWorkouts(db, ctx(), { memberId: M2 });
    expect(none).toMatchObject({ connected: false, count: 0, workouts: [] });
  });

  it("다른 팀 회원·없는 회원은 없는 것처럼 답한다", async () => {
    const { db } = setup();
    await expect(listMemberWorkouts(db, ctx(), { memberId: M3 })).rejects.toBeInstanceOf(ToolInputError);
    await expect(listMemberWorkouts(db, ctx(), { name: "없는사람" })).rejects.toBeInstanceOf(ToolInputError);
    await expect(listMemberWorkouts(db, ctx(), {})).rejects.toBeInstanceOf(ToolInputError);
  });

  it("limit 로 자른다", async () => {
    const { db } = setup();
    const res = await listMemberWorkouts(db, ctx(), { memberId: M1, limit: 1 });
    expect(res.count).toBe(1);
  });
});
