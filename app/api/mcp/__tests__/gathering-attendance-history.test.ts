import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { classifyCancelTiming, minutesFromStart } from "@/lib/gathering/cancel-timing";
import type { OperatorContext } from "@/lib/mcp/auth";
import { listGatheringAttendanceHistory } from "@/lib/mcp/gathering-attendance-history";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

import { FakeSupabase } from "./fake-supabase";

const TEAM = "tttttttt-0000-4000-8000-000000000001";
const OTHER_TEAM = "tttttttt-0000-4000-8000-000000000002";
const GTHR = "gggggggg-0000-4000-8000-000000000001";
const ADMIN = "aaaaaaaa-0000-4000-8000-000000000000";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const M2 = "aaaaaaaa-0000-4000-8000-000000000002";
const M3 = "aaaaaaaa-0000-4000-8000-000000000003";

// 모임 시작 = 2026-11-25 20:00 KST = 11:00Z
const START = "2026-11-25T11:00:00Z";

const ctx = (o: Partial<OperatorContext> = {}): OperatorContext => ({
  mem_id: ADMIN,
  team_id: TEAM,
  is_admin: true,
  mem_nm: "운영진",
  ...o,
});

function setup() {
  const fake = new FakeSupabase({
    gthr_mst: [
      { gthr_id: GTHR, gthr_nm: "정기런", stt_at: START, end_at: null, team_id: TEAM, del_yn: false },
    ],
    gthr_attd_rel: [{ gthr_id: GTHR, mem_id: M3, crt_at: "2026-11-24T01:00:00Z" }],
    gthr_attd_hist: [
      // 시작 30분 전 본인 취소
      {
        gthr_id: GTHR, mem_id: M1, evt_cd: "cancel", actor_cd: "self", actor_mem_id: M1,
        reason_txt: "야근", evt_at: "2026-11-25T10:30:00Z", reg_at: "2026-11-23T00:00:00Z",
      },
      // 시작 40분 뒤 운영진이 뺌
      {
        gthr_id: GTHR, mem_id: M2, evt_cd: "cancel", actor_cd: "admin", actor_mem_id: ADMIN,
        reason_txt: null, evt_at: "2026-11-25T11:40:00Z", reg_at: null,
      },
      // M3: 시작 뒤 취소했다가 다시 신청 — 지금은 참석 중
      {
        gthr_id: GTHR, mem_id: M3, evt_cd: "cancel", actor_cd: "self", actor_mem_id: M3,
        reason_txt: null, evt_at: "2026-11-25T11:05:00Z", reg_at: null,
      },
    ],
    mem_mst: [
      { mem_id: ADMIN, mem_nm: "운영진" },
      { mem_id: M1, mem_nm: "김하나" },
      { mem_id: M2, mem_nm: "이둘" },
      { mem_id: M3, mem_nm: "박셋" },
    ],
  });
  return { fake, db: fake as unknown as SupabaseClient<Database> };
}

describe("classifyCancelTiming / minutesFromStart", () => {
  it("시작 전·뒤를 가르고 정확히 같은 순간은 시작 전으로 본다", () => {
    expect(classifyCancelTiming("2026-11-25T10:59:59Z", START)).toBe("before_start");
    expect(classifyCancelTiming(START, START)).toBe("before_start");
    expect(classifyCancelTiming("2026-11-25T11:00:01Z", START)).toBe("after_start");
  });

  it("분 단위 차이는 시작 뒤가 양수", () => {
    expect(minutesFromStart("2026-11-25T11:40:30Z", START)).toBe(40);
    expect(minutesFromStart("2026-11-25T10:30:00Z", START)).toBe(-30);
  });
});

describe("list_gathering_attendance_history", () => {
  it("admin 이 아니면 거부", async () => {
    const { db } = setup();
    await expect(
      listGatheringAttendanceHistory(db, ctx({ is_admin: false }), { gathering_id: GTHR }),
    ).rejects.toBeInstanceOf(ToolDeniedError);
  });

  it("다른 팀 모임은 없는 것으로 응답", async () => {
    const { db } = setup();
    await expect(
      listGatheringAttendanceHistory(db, ctx({ team_id: OTHER_TEAM }), { gathering_id: GTHR }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });

  it("취소마다 시작 전/후·주체·사유·재참석 여부를 돌려준다", async () => {
    const { db } = setup();
    const r = await listGatheringAttendanceHistory(db, ctx(), { gathering_id: GTHR });

    expect(r.attendees).toHaveLength(1);
    expect(r.attendees[0]).toMatchObject({ mem_id: M3, mem_nm: "박셋" });

    const byMem = Object.fromEntries(r.cancellations.map((c) => [c.mem_id, c]));
    expect(byMem[M1]).toMatchObject({
      timing: "before_start", minutes_from_start: -30, by: "self", reason: "야근", rejoined: false,
    });
    expect(byMem[M1].applied_at).not.toBeNull();
    expect(byMem[M2]).toMatchObject({
      timing: "after_start", minutes_from_start: 40, by: "admin", by_mem_nm: "운영진", reason: null,
    });
    expect(byMem[M3]).toMatchObject({ timing: "after_start", rejoined: true });

    expect(r.summary).toEqual({
      attending_count: 1,
      canceled_count: 3,
      canceled_before_start: 1,
      canceled_after_start: 2,
    });
  });

  it("읽기 전용 — 아무것도 쓰지 않는다", async () => {
    const { fake, db } = setup();
    await listGatheringAttendanceHistory(db, ctx(), { gathering_id: GTHR });
    expect(fake.ops.filter((o) => o.op !== "select")).toEqual([]);
  });
});
