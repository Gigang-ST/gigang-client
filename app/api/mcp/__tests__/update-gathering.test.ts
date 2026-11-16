import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";

import { FakeSupabase } from "./fake-supabase";

/**
 * #644 update_gathering 검증.
 *
 * ⚠️ 실제 알림·단톡방 발송 금지 — server-only 체인(insert-noti·kakao-dispatch·promotion-followup)을
 *   전부 vi.mock 으로 대체한다([[troubleshooting/vitest-server-only-trap]]).
 */
const { insertNotiManyMock, notifyUpdatedMock, followupsMock } = vi.hoisted(() => ({
  insertNotiManyMock: vi.fn(async (input: { memIds: string[] }) => ({
    inAppOk: true,
    notifiedMemIds: input.memIds,
  })),
  notifyUpdatedMock: vi.fn(async (_facts: unknown) => undefined),
  followupsMock: vi.fn(async (_a: unknown, _b: unknown) => undefined),
}));
vi.mock("@/lib/notifications/insert-noti", () => ({ insertNotiMany: insertNotiManyMock }));
vi.mock("@/lib/gathering/kakao-dispatch", () => ({ notifyGatheringUpdated: notifyUpdatedMock }));
vi.mock("@/lib/gathering/promotion-followup", () => ({ runPromotionFollowups: followupsMock }));

import { updateGatheringViaMcp } from "@/lib/mcp/update-gathering";

const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_TEAM = "99999999-2222-4222-8222-222222222222";
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const AUTHOR_ID = "11111111-1111-4111-8111-aaaaaaaaaaaa";
const STRANGER_ID = "11111111-1111-4111-8111-bbbbbbbbbbbb";
const GTHR_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_GTHR_ID = "44444444-3333-4333-8333-333333333333";
const PAST_GTHR_ID = "55555555-3333-4333-8333-333333333333";
const A1 = "aaaaaaaa-0000-4000-8000-000000000001";
const A2 = "aaaaaaaa-0000-4000-8000-000000000002";

function ctxOf(overrides: Partial<OperatorContext> = {}): OperatorContext {
  return { mem_id: ADMIN_ID, team_id: TEAM_ID, is_admin: true, mem_nm: "관리자", ...overrides };
}

/** rpc 를 흉내 내는 FakeSupabase — 호출 인자를 기록하고 정해진 승급 결과를 돌려준다. */
class FakeWithRpc extends FakeSupabase {
  rpcCalls: { fn: string; args: unknown }[] = [];
  rpcResult: unknown = { promoted: [], notify_open_seat: false };
  async rpc(fn: string, args: unknown) {
    this.rpcCalls.push({ fn, args });
    return { data: this.rpcResult, error: null };
  }
}

function makeDb() {
  return new FakeWithRpc({
    gthr_mst: [
      {
        gthr_id: GTHR_ID,
        team_id: TEAM_ID,
        gthr_nm: "토요 정기런",
        stt_at: "2099-08-29T22:00:00.000Z", // KST 2099-08-30 07:00
        end_at: null,
        loc_txt: "잠수교",
        desc_txt: "천천히 달려요",
        max_prt_cnt: 10,
        short_id: "abc",
        crt_by: AUTHOR_ID,
        del_yn: false,
      },
      {
        gthr_id: OTHER_GTHR_ID,
        team_id: OTHER_TEAM,
        gthr_nm: "다른 팀 모임",
        stt_at: "2099-08-29T22:00:00.000Z",
        end_at: null,
        loc_txt: "x",
        desc_txt: null,
        max_prt_cnt: null,
        short_id: "zzz",
        crt_by: AUTHOR_ID,
        del_yn: false,
      },
      {
        gthr_id: PAST_GTHR_ID,
        team_id: TEAM_ID,
        gthr_nm: "지난 모임",
        stt_at: "2020-01-01T00:00:00.000Z",
        end_at: null,
        loc_txt: "x",
        desc_txt: null,
        max_prt_cnt: null,
        short_id: "old",
        crt_by: AUTHOR_ID,
        del_yn: false,
      },
    ],
    gthr_attd_rel: [
      { gthr_id: GTHR_ID, mem_id: AUTHOR_ID },
      { gthr_id: GTHR_ID, mem_id: A1 },
      { gthr_id: GTHR_ID, mem_id: A2 },
    ],
  });
}

const row = (db: FakeSupabase) => db.tables.gthr_mst.find((r) => r.gthr_id === GTHR_ID)!;

describe("update_gathering", () => {
  beforeEach(() => {
    insertNotiManyMock.mockClear();
    notifyUpdatedMock.mockClear();
    followupsMock.mockClear();
  });

  it("dry_run 은 전/후만 돌려주고 아무것도 쓰지 않는다", async () => {
    const db = makeDb();
    const r = await updateGatheringViaMcp(db.asClient(), ctxOf(), {
      gathering_id: GTHR_ID,
      loc_txt: "여의도",
      stt_at: "2099-08-30 08:00",
      dry_run: true,
    });
    expect(r.dry_run).toBe(true);
    expect(r.changed_fields).toEqual(["stt_at", "loc_txt"]);
    expect(r.changes.loc_txt).toEqual({ before: "잠수교", after: "여의도" });
    expect(r.changes.stt_at).toEqual({ before: "2099-08-30(일) 07:00", after: "2099-08-30(일) 08:00" });
    expect(db.opsOn("gthr_mst", "update")).toHaveLength(0);
    expect(db.opsOn("mcp_audit_log")).toHaveLength(0);
    expect(insertNotiManyMock).not.toHaveBeenCalled();
  });

  it("바꾼 필드만 쓰고 기본은 알림을 안 보낸다", async () => {
    const db = makeDb();
    const r = await updateGatheringViaMcp(db.asClient(), ctxOf(), {
      gathering_id: GTHR_ID,
      loc_txt: "여의도",
      desc_txt: "본문 수정",
    });
    expect(r.changed_fields).toEqual(["loc_txt", "desc_txt"]);
    expect(row(db).loc_txt).toBe("여의도");
    expect(row(db).desc_txt).toBe("본문 수정");
    expect(row(db).gthr_nm).toBe("토요 정기런"); // 안 준 필드는 그대로
    expect(r.audit_id).not.toBeNull();
    expect(db.opsOn("mcp_audit_log", "insert")).toHaveLength(1);
    expect(insertNotiManyMock).not.toHaveBeenCalled();
    expect(notifyUpdatedMock).not.toHaveBeenCalled();
    expect(r.notified_cnt).toBe(0);
  });

  it("같은 값이면 changed_fields 가 비고 쓰지 않는다", async () => {
    const db = makeDb();
    const r = await updateGatheringViaMcp(db.asClient(), ctxOf(), {
      gathering_id: GTHR_ID,
      loc_txt: "잠수교",
    });
    expect(r.changed_fields).toEqual([]);
    expect(db.opsOn("gthr_mst", "update")).toHaveLength(0);
  });

  it("notify=true 면 작성자를 뺀 참석자에게 알리고 일시·장소 변경은 단톡방 공지를 요청한다", async () => {
    const db = makeDb();
    const r = await updateGatheringViaMcp(
      db.asClient(),
      ctxOf({ mem_id: AUTHOR_ID, is_admin: false }),
      { gathering_id: GTHR_ID, loc_txt: "여의도", notify: true },
    );
    expect(insertNotiManyMock).toHaveBeenCalledTimes(1);
    const arg = insertNotiManyMock.mock.calls[0][0] as { memIds: string[]; notiTypeEnm: string };
    expect(arg.notiTypeEnm).toBe("gthr_upd");
    expect(arg.memIds.sort()).toEqual([A1, A2]);
    expect(r.notified_cnt).toBe(2);
    expect(notifyUpdatedMock).toHaveBeenCalledTimes(1);
    expect(r.kakao_notice).toBe("requested");
  });

  it("notify=true 라도 제목만 바꾸면 단톡방 공지는 요청하지 않는다", async () => {
    const db = makeDb();
    const r = await updateGatheringViaMcp(db.asClient(), ctxOf(), {
      gathering_id: GTHR_ID,
      gthr_nm: "토요 정기런 (수정)",
      notify: true,
    });
    expect(notifyUpdatedMock).not.toHaveBeenCalled();
    expect(r.kakao_notice).toBe("skipped");
  });

  it("작성자가 아닌 일반 멤버는 거부한다", async () => {
    const db = makeDb();
    await expect(
      updateGatheringViaMcp(db.asClient(), ctxOf({ mem_id: STRANGER_ID, is_admin: false }), {
        gathering_id: GTHR_ID,
        loc_txt: "여의도",
      }),
    ).rejects.toBeInstanceOf(ToolDeniedError);
    expect(db.opsOn("gthr_mst", "update")).toHaveLength(0);
  });

  it("다른 팀 모임은 찾을 수 없다", async () => {
    const db = makeDb();
    await expect(
      updateGatheringViaMcp(db.asClient(), ctxOf(), { gathering_id: OTHER_GTHR_ID, loc_txt: "여의도" }),
    ).rejects.toThrow("모임을 찾을 수 없습니다.");
    expect(row(db).loc_txt).toBe("잠수교");
    expect(db.tables.gthr_mst.find((r) => r.gthr_id === OTHER_GTHR_ID)!.loc_txt).toBe("x");
  });

  it("지난 모임은 작성자도 못 고치고 운영진만 고친다", async () => {
    const db = makeDb();
    await expect(
      updateGatheringViaMcp(db.asClient(), ctxOf({ mem_id: AUTHOR_ID, is_admin: false }), {
        gathering_id: PAST_GTHR_ID,
        loc_txt: "여의도",
      }),
    ).rejects.toBeInstanceOf(ToolDeniedError);
    const r = await updateGatheringViaMcp(db.asClient(), ctxOf(), {
      gathering_id: PAST_GTHR_ID,
      loc_txt: "여의도",
    });
    expect(r.changed_fields).toEqual(["loc_txt"]);
  });

  it("작성자는 일시를 과거로 옮길 수 없다", async () => {
    const db = makeDb();
    await expect(
      updateGatheringViaMcp(db.asClient(), ctxOf({ mem_id: AUTHOR_ID, is_admin: false }), {
        gathering_id: GTHR_ID,
        stt_at: "2020-01-01 07:00",
      }),
    ).rejects.toBeInstanceOf(ToolDeniedError);
  });

  it("입력 오류: 필드 없음·시간대 표기·종료<시작·빈 장소", async () => {
    const db = makeDb();
    const call = (extra: Record<string, unknown>) =>
      updateGatheringViaMcp(db.asClient(), ctxOf(), { gathering_id: GTHR_ID, ...extra });
    await expect(call({})).rejects.toBeInstanceOf(ToolInputError);
    await expect(call({ stt_at: "2099-08-30T08:00:00+09:00" })).rejects.toBeInstanceOf(ToolInputError);
    // end_at 만 바꿔도 기존 시작과 합쳐 본다
    await expect(call({ end_at: "2099-08-30 06:00" })).rejects.toBeInstanceOf(ToolInputError);
    await expect(call({ loc_txt: "   " })).rejects.toBeInstanceOf(ToolInputError);
    expect(db.opsOn("gthr_mst", "update")).toHaveLength(0);
  });

  it("정원을 늘리면 대기열을 당기고, 승급 알림은 notify 일 때만 나간다", async () => {
    const db = makeDb();
    db.rpcResult = { promoted: [A1], notify_open_seat: false };
    const r1 = await updateGatheringViaMcp(db.asClient(), ctxOf(), { gathering_id: GTHR_ID, max_prt_cnt: 12 });
    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0].fn).toBe("promote_gthr_waitlist_notice");
    expect(r1.promoted_cnt).toBe(1);
    expect(followupsMock).not.toHaveBeenCalled();

    await updateGatheringViaMcp(db.asClient(), ctxOf(), { gathering_id: GTHR_ID, max_prt_cnt: 14, notify: true });
    expect(followupsMock).toHaveBeenCalledTimes(1);
  });

  it("정원을 줄이거나 null→숫자면 대기열을 건드리지 않는다", async () => {
    const db = makeDb();
    await updateGatheringViaMcp(db.asClient(), ctxOf(), { gathering_id: GTHR_ID, max_prt_cnt: 5 });
    expect(db.rpcCalls).toHaveLength(0);
  });
});
