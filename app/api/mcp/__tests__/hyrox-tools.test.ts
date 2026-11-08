import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";

import { FakeSupabase } from "./fake-supabase";

/**
 * #349 하이록스 MCP 도구 — `log_hyrox_record` 의 권한·검증·저장 경로.
 *
 * 저장 코어(`insertRaceRecordCore`)는 앱 서버 액션과 같은 것이라 여기선 mock 으로 갈아 끼우고
 * **무엇을 넘기는지**만 본다(코어 자체의 종목 해석·캐시 판정은 랭킹 RPC 를 불러 가짜 DB 로 재현하기 어렵다).
 */
const { insertCoreMock } = vi.hoisted(() => ({
  insertCoreMock: vi.fn(async () => ({ ok: true as const, shouldInvalidate: true })),
}));
vi.mock("@/lib/race-record", () => ({ insertRaceRecordCore: insertCoreMock }));

import { logHyroxRecord, parseHyroxRecordInput } from "@/lib/mcp/hyrox";

const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const COMP = "44444444-4444-4444-8444-444444444444";
const ROAD_COMP = "55555555-5555-4555-8555-555555555555";

function ctxOf(over: Partial<OperatorContext> = {}): OperatorContext {
  return { mem_id: ME, team_id: TEAM_ID, is_admin: false, mem_nm: "나", ...over };
}

function seed() {
  const member = (mem_id: string, mem_nm: string, gdr_enm: string) => ({
    rel: { team_mem_id: `tm-${mem_id}`, team_id: TEAM_ID, mem_id, mem_st_cd: "active", vers: 0, del_yn: false },
    mst: { mem_id, mem_nm, gdr_enm, vers: 0, del_yn: false },
  });
  const me = member(ME, "나", "female");
  const other = member(OTHER, "너", "male");
  return new FakeSupabase({
    team_mem_rel: [me.rel, other.rel],
    mem_mst: [me.mst, other.mst],
    comp_mst: [
      { comp_id: COMP, comp_nm: "HYROX Seoul", comp_sprt_cd: "hyrox", stt_dt: "2026-05-09", end_dt: "2026-05-10", vers: 0, del_yn: false },
      { comp_id: ROAD_COMP, comp_nm: "서울마라톤", comp_sprt_cd: "road_run", stt_dt: "2026-03-15", end_dt: null, vers: 0, del_yn: false },
    ],
    mcp_audit_log: [],
  });
}

const BASE = { comp_id: COMP, division: "OPEN", total_time: "1:12:34" };

beforeEach(() => insertCoreMock.mockClear());

describe("parseHyroxRecordInput", () => {
  it("시간 문자열을 초로, 스플릿 키는 대문자로 받는다", () => {
    const p = parseHyroxRecordInput({ ...BASE, division: "pro", splits: { skierg: "4:15", ROW: "" } });
    expect(p).toEqual({ division: "PRO", totalSec: 4354, splits: { SKIERG: 255 } });
  });

  it("모르는 스테이션·부문·형식은 거부한다", () => {
    expect(() => parseHyroxRecordInput({ ...BASE, splits: { RUN: "4:00" } })).toThrow(ToolInputError);
    expect(() => parseHyroxRecordInput({ ...BASE, division: "ELITE" })).toThrow(ToolInputError);
    expect(() => parseHyroxRecordInput({ ...BASE, total_time: "72분" })).toThrow(ToolInputError);
  });

  it("스테이션 합이 총시간보다 길면 거부한다(단위 혼동)", () => {
    expect(() => parseHyroxRecordInput({ ...BASE, total_time: "10:00", splits: { SKIERG: "8:00", ROW: "8:00" } })).toThrow(
      /스테이션 합/,
    );
  });
});

describe("logHyroxRecord", () => {
  it("admin 이 아니면 남의 기록을 넣을 수 없다", async () => {
    const db = seed();
    await expect(logHyroxRecord(db.asClient(), ctxOf(), { ...BASE, member_id: OTHER })).rejects.toBeInstanceOf(
      ToolDeniedError,
    );
    expect(insertCoreMock).not.toHaveBeenCalled();
  });

  it("dry_run 은 저장·감사 없이 해석값만 돌려준다", async () => {
    const db = seed();
    const res = await logHyroxRecord(db.asClient(), ctxOf(), { ...BASE, dry_run: true, splits: { WALL_BALL: "6:01" } });
    expect(res).toMatchObject({
      dry_run: true,
      saved: false,
      race_dt: "2026-05-09",
      total_time: "1:12:34",
      splits: { WALL_BALL: "6:01" },
      ranked: true,
    });
    expect(insertCoreMock).not.toHaveBeenCalled();
    expect(db.opsOn("mcp_audit_log", "insert")).toHaveLength(0);
  });

  it("하이록스가 아닌 대회·기간 밖 날짜는 거부한다", async () => {
    const db = seed();
    await expect(logHyroxRecord(db.asClient(), ctxOf(), { ...BASE, comp_id: ROAD_COMP })).rejects.toThrow(/하이록스 대회가 아닙니다/);
    await expect(logHyroxRecord(db.asClient(), ctxOf(), { ...BASE, race_dt: "2026-05-11" })).rejects.toThrow(/대회 기간/);
  });

  it("admin 은 다른 회원 기록을 넣고, 코어에 대상·부문·스플릿을 넘기고, 감사행을 남긴다", async () => {
    const db = seed();
    const res = await logHyroxRecord(db.asClient(), ctxOf({ is_admin: true }), {
      ...BASE,
      member_id: OTHER,
      race_dt: "2026-05-10",
      splits: { SKIERG: "4:15" },
    });
    expect(res).toMatchObject({ saved: true, should_invalidate: true, team_mem_id: `tm-${OTHER}` });
    expect(insertCoreMock).toHaveBeenCalledTimes(1);
    const [, , teamId, owner, input] = insertCoreMock.mock.calls[0] as unknown as [
      unknown,
      unknown,
      string,
      { memId: string; gender: string },
      { eventType: string; totalSeconds: number; competitionDate: string; stationSplits: unknown },
    ];
    expect(teamId).toBe(TEAM_ID);
    expect(owner).toMatchObject({ memId: OTHER, gender: "male" });
    expect(input).toMatchObject({
      eventType: "OPEN",
      totalSeconds: 4354,
      competitionDate: "2026-05-10",
      stationSplits: { SKIERG: 255 },
    });
    const audit = db.opsOn("mcp_audit_log", "insert");
    expect(audit).toHaveLength(1);
    expect(audit[0].payload).toMatchObject({ tool_nm: "log_hyrox_record", actor_mem_id: ME });
  });

  it("코어가 거부하면(중복 등) 그 사유를 입력 오류로 돌려준다", async () => {
    insertCoreMock.mockResolvedValueOnce({ ok: false, message: "동일 대회·종목·날짜·대회명의 기록이 이미 있습니다." } as never);
    const db = seed();
    await expect(logHyroxRecord(db.asClient(), ctxOf(), BASE)).rejects.toThrow(/이미 있습니다/);
    expect(db.opsOn("mcp_audit_log", "insert")).toHaveLength(0);
  });
});
