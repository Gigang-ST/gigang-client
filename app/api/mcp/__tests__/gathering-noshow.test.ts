import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { followupsMock } = vi.hoisted(() => ({ followupsMock: vi.fn() }));
vi.mock("@/lib/gathering/promotion-followup", () => ({ runPromotionFollowups: followupsMock }));

import { validateNoshowReason } from "@/lib/gathering/noshow";
import type { OperatorContext } from "@/lib/mcp/auth";
import { listMemberNoshowsViaMcp, markGatheringNoshowViaMcp } from "@/lib/mcp/gathering-noshow";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

import { FakeSupabase } from "./fake-supabase";

/** `rpc()` 호출을 기록하고 이름별 결과를 돌려주는 인메모리 DB */
class RpcFake extends FakeSupabase {
  rpcLog: { name: string; args: Record<string, unknown> }[] = [];
  rpcResults: Record<string, { data: unknown; error: unknown }> = {};
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
    this.rpcLog.push({ name, args });
    return Promise.resolve(this.rpcResults[name] ?? { data: null, error: null });
  }
}

const TEAM = "tttttttt-0000-4000-8000-000000000001";
const GTHR = "gggggggg-0000-4000-8000-000000000001";
const ADMIN = "aaaaaaaa-0000-4000-8000-000000000000";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const M2 = "aaaaaaaa-0000-4000-8000-000000000002";
const M3 = "aaaaaaaa-0000-4000-8000-000000000003";

const PAST_START = "2026-11-25T11:00:00Z"; // 이미 지난 모임
const FUTURE_START = "2099-01-01T11:00:00Z";

const ctx = (o: Partial<OperatorContext> = {}): OperatorContext => ({
  mem_id: ADMIN,
  team_id: TEAM,
  is_admin: true,
  mem_nm: "운영진",
  ...o,
});

function setup(start = PAST_START, extraAttendees: { mem_id: string; nm: string }[] = []) {
  const fake = new RpcFake({
    gthr_mst: [{ gthr_id: GTHR, gthr_nm: "정기런", stt_at: start, team_id: TEAM, del_yn: false }],
    gthr_attd_rel: [
      { gthr_id: GTHR, mem_id: M1, crt_at: "2026-11-24T01:00:00Z", mem_mst: { mem_nm: "김하나" } },
      { gthr_id: GTHR, mem_id: M2, crt_at: "2026-11-24T02:00:00Z", mem_mst: { mem_nm: "이둘" } },
      ...extraAttendees.map((a) => ({
        gthr_id: GTHR, mem_id: a.mem_id, crt_at: "2026-11-24T03:00:00Z", mem_mst: { mem_nm: a.nm },
      })),
    ],
    gthr_attd_hist: [],
    mem_mst: [
      { mem_id: ADMIN, mem_nm: "운영진" },
      { mem_id: M1, mem_nm: "김하나" },
      { mem_id: M2, mem_nm: "이둘" },
    ],
    mcp_audit_log: [],
  });
  fake.rpcResults.noshow_gthr_attendance = {
    data: { status: "ok", promoted: [], notify_open_seat: false },
    error: null,
  };
  return { fake, db: fake as unknown as SupabaseClient<Database> };
}

beforeEach(() => followupsMock.mockReset());

describe("validateNoshowReason", () => {
  it("빈 값·공백은 거부, 500자 초과도 거부", () => {
    expect(validateNoshowReason("")).toMatchObject({ ok: false, code: "reason_required" });
    expect(validateNoshowReason("   ")).toMatchObject({ ok: false, code: "reason_required" });
    expect(validateNoshowReason(null)).toMatchObject({ ok: false, code: "reason_required" });
    expect(validateNoshowReason("a".repeat(501))).toMatchObject({ ok: false, code: "reason_too_long" });
    expect(validateNoshowReason(" 노쇼 ")).toEqual({ ok: true, value: "노쇼" });
  });
});

describe("mark_gathering_noshow", () => {
  it("admin 이 아니면 거부(아무것도 부르지 않음)", async () => {
    const { fake, db } = setup();
    await expect(
      markGatheringNoshowViaMcp(db, ctx({ is_admin: false }), { gathering_id: GTHR, member_id: M1, reason: "노쇼" }),
    ).rejects.toBeInstanceOf(ToolDeniedError);
    expect(fake.rpcLog).toEqual([]);
  });

  it("사유가 비면 거부", async () => {
    const { fake, db } = setup();
    await expect(
      markGatheringNoshowViaMcp(db, ctx(), { gathering_id: GTHR, member_id: M1, reason: "  " }),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(fake.rpcLog).toEqual([]);
  });

  it("회원을 안 주면 거부", async () => {
    const { db } = setup();
    await expect(
      markGatheringNoshowViaMcp(db, ctx(), { gathering_id: GTHR, reason: "노쇼" }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });

  it("참석자가 아닌 회원은 거부", async () => {
    const { db } = setup();
    await expect(
      markGatheringNoshowViaMcp(db, ctx(), { gathering_id: GTHR, member_id: M3, reason: "노쇼" }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });

  it("dry_run 은 미리보기만 — RPC·감사행 없음", async () => {
    const { fake, db } = setup();
    const r = await markGatheringNoshowViaMcp(db, ctx(), {
      gathering_id: GTHR, member_name: "김하나", reason: "노쇼", dry_run: true,
    });
    expect(r).toMatchObject({
      status: "dry_run",
      member: { mem_id: M1, mem_nm: "김하나" },
      noshow_count_before: 0,
      noshow_count_after: 1,
      gathering: { started: true },
    });
    expect(fake.rpcLog).toEqual([]);
    expect(fake.opsOn("mcp_audit_log", "insert")).toEqual([]);
  });

  it("처리하면 RPC 를 부르고 감사행을 남기며 알림은 기본으로 안 보낸다", async () => {
    const { fake, db } = setup();
    fake.rpcResults.noshow_gthr_attendance = {
      data: { status: "ok", promoted: [M3], notify_open_seat: true },
      error: null,
    };
    const r = await markGatheringNoshowViaMcp(db, ctx(), { gathering_id: GTHR, member_id: M1, reason: "노쇼" });
    expect(r).toMatchObject({ status: "removed", promoted_cnt: 1, noshow_count_after: 1 });
    expect(fake.rpcLog).toHaveLength(1);
    expect(fake.rpcLog[0]).toEqual({
      name: "noshow_gthr_attendance",
      args: { p_gthr_id: GTHR, p_mem_id: M1, p_team_id: TEAM, p_actor_mem_id: ADMIN, p_reason: "노쇼" },
    });
    expect(followupsMock).not.toHaveBeenCalled();
    expect(fake.opsOn("mcp_audit_log", "insert")).toHaveLength(1);
  });

  it("notify=true 이고 승급이 있으면 승급 알림 함수를 부른다", async () => {
    const { fake, db } = setup();
    fake.rpcResults.noshow_gthr_attendance = {
      data: { status: "ok", promoted: [M3], notify_open_seat: false },
      error: null,
    };
    await markGatheringNoshowViaMcp(db, ctx(), { gathering_id: GTHR, member_id: M1, reason: "노쇼", notify: true });
    expect(followupsMock).toHaveBeenCalledTimes(1);
  });

  it("시작 전 모임이면 경고가 붙는다", async () => {
    const { db } = setup(FUTURE_START);
    const r = await markGatheringNoshowViaMcp(db, ctx(), {
      gathering_id: GTHR, member_id: M1, reason: "노쇼", dry_run: true,
    });
    expect(r).toMatchObject({ status: "dry_run", gathering: { started: false } });
    expect((r as { warnings: string[] }).warnings).toHaveLength(1);
  });

  it("같은 이름 참석자가 둘이면 처리하지 않고 후보만 돌려준다", async () => {
    const { fake, db } = setup(PAST_START, [{ mem_id: M3, nm: "김하나" }]);
    const r = await markGatheringNoshowViaMcp(db, ctx(), {
      gathering_id: GTHR, member_name: "김하나", reason: "노쇼",
    });
    expect(r).toMatchObject({ status: "ambiguous_member" });
    expect((r as { candidates: unknown[] }).candidates).toHaveLength(2);
    expect(fake.rpcLog).toEqual([]);
  });

  it("RPC 가 참석 아님을 돌려주면 입력 오류", async () => {
    const { fake, db } = setup();
    fake.rpcResults.noshow_gthr_attendance = { data: { status: "not_attending" }, error: null };
    await expect(
      markGatheringNoshowViaMcp(db, ctx(), { gathering_id: GTHR, member_id: M1, reason: "노쇼" }),
    ).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("list_member_noshows", () => {
  it("admin 이 아니면 거부", async () => {
    const { db } = setup();
    await expect(listMemberNoshowsViaMcp(db, ctx({ is_admin: false }), {})).rejects.toBeInstanceOf(ToolDeniedError);
  });

  it("회원별 횟수·내역을 횟수 많은 순으로", async () => {
    const { fake, db } = setup();
    const hist = (mem: string, evt: string, id: string, reason: string) => ({
      hist_id: id, gthr_id: GTHR, mem_id: mem, evt_cd: "cancel", noshow_yn: true,
      evt_at: evt, reason_txt: reason, actor_mem_id: ADMIN,
      gthr_mst: { gthr_id: GTHR, gthr_nm: "정기런", stt_at: PAST_START, team_id: TEAM },
    });
    fake.tables.gthr_attd_hist = [
      hist(M1, "2026-11-25T12:00:00Z", "h1", "노쇼"),
      hist(M2, "2026-11-18T12:00:00Z", "h2", "노쇼"),
      hist(M2, "2026-11-25T12:30:00Z", "h3", "연락 두절"),
      { ...hist(M1, "2026-11-01T00:00:00Z", "h4", "일반 취소"), noshow_yn: false },
    ];
    const r = await listMemberNoshowsViaMcp(db, ctx(), {});
    expect(r.members.map((m) => [m.mem_nm, m.noshow_count])).toEqual([["이둘", 2], ["김하나", 1]]);
    expect(r.members[0].entries[0]).toMatchObject({ reason: "연락 두절", by_mem_nm: "운영진" });
  });
});
