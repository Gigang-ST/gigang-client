import { beforeEach, describe, expect, it, vi } from "vitest";

import { dayjs } from "@/lib/dayjs";
import {
  applyToGathering,
  approveApplication,
  backfillApprovals,
  canReviewApplications,
  cancelApplication,
  countPendingApplications,
  rejectApplication,
  validateApplyMemo,
} from "@/lib/gathering/application";

// ─────────────────────────────────────────────────────────────
// 가짜 supabase — 테이블별 핸들러로 라우팅하는 체이너블 빌더.
// 진짜 클라이언트처럼 .select().eq()....maybeSingle() 을 받아 넘기고, 마지막에 await 되면
// 핸들러가 돌려준 값을 낸다. 어떤 필터로 불렀는지도 검사할 수 있게 state 를 남긴다.
// ─────────────────────────────────────────────────────────────

type QState = {
  table: string;
  op: "select" | "update" | "upsert";
  filters: [string, unknown][];
  payload: unknown;
  count: boolean;
};

type Handler = (s: QState) => unknown;

function makeAdmin(handlers: Record<string, Handler>, rpc: (name: string, args: unknown) => unknown) {
  const seen: QState[] = [];

  function query(table: string) {
    const state: QState = { table, op: "select", filters: [], payload: null, count: false };
    seen.push(state);

    const api = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count) state.count = true;
        return api;
      },
      eq(col: string, val: unknown) {
        state.filters.push([col, val]);
        return api;
      },
      lte(col: string, val: unknown) {
        state.filters.push([col, val]);
        return api;
      },
      gte(col: string, val: unknown) {
        state.filters.push([col, val]);
        return api;
      },
      update(payload: unknown) {
        state.op = "update";
        state.payload = payload;
        return api;
      },
      upsert(payload: unknown) {
        state.op = "upsert";
        state.payload = payload;
        return api;
      },
      maybeSingle: () => api,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then(res: any, rej: any) {
        const h = handlers[table];
        if (!h) throw new Error(`핸들러 없는 테이블 조회: ${table}`);
        return Promise.resolve(h(state)).then(res, rej);
      },
    };
    return api;
  }

  return {
    admin: {
      from: (table: string) => query(table),
      rpc: (name: string, args: unknown) => Promise.resolve(rpc(name, args)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    seen,
  };
}

const FUTURE = dayjs().add(30, "day").toISOString();
const PAST = dayjs().subtract(30, "day").toISOString();

const BASE_GTHR = {
  gthr_id: "g1",
  gthr_nm: "송년회",
  crt_by: "host",
  team_id: "team-1",
  aprv_req_yn: true,
  req_attd_cnt: null as number | null,
  req_attd_months: null as number | null,
  stt_at: FUTURE,
  end_at: null as string | null,
};

type Cfg = {
  gthr: Record<string, unknown> | null;
  attending: Record<string, unknown> | null;
  existingAply: { aply_st_cd: string } | null;
  attdCount: number;
  updateRows: { aply_id: string }[];
  rpcResult: unknown;
};

let cfg: Cfg;
let rpcCalls: { name: string; args: unknown }[];

function setup(over: Partial<Cfg> = {}) {
  cfg = {
    gthr: { ...BASE_GTHR },
    attending: null,
    existingAply: null,
    attdCount: 0,
    updateRows: [{ aply_id: "a1" }],
    rpcResult: "ok",
    ...over,
  };
  rpcCalls = [];

  return makeAdmin(
    {
      gthr_mst: () => ({ data: cfg.gthr }),
      // gthr_attd_rel 은 두 용도로 불린다: 내 참석 여부(단건)와 조건 집계(count).
      gthr_attd_rel: (s) => (s.count ? { count: cfg.attdCount, error: null } : { data: cfg.attending }),
      gthr_aply_rel: (s) => {
        if (s.count) return { count: 0, error: null };
        if (s.op === "update") return { data: cfg.updateRows, error: null };
        if (s.op === "upsert") return { error: null };
        return { data: cfg.existingAply };
      },
    },
    (name, args) => {
      rpcCalls.push({ name, args });
      return { data: cfg.rpcResult, error: null };
    },
  );
}

const ACTOR = { memId: "mem-1", isAdmin: false };

beforeEach(() => {
  vi.restoreAllMocks();
  // 코어는 실패 경로에서 console.error 로 남긴다 — 테스트 출력이 지저분해지지 않게 막는다.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ─────────────────────────────────────────────────────────────

describe("canReviewApplications", () => {
  it("운영진은 남의 모임도 심사한다", () => {
    expect(canReviewApplications({ crt_by: "host" }, { memId: "admin-1", isAdmin: true })).toBe(true);
  });

  it("개설자는 운영진이 아니어도 자기 모임을 심사한다", () => {
    expect(canReviewApplications({ crt_by: "host" }, { memId: "host", isAdmin: false })).toBe(true);
  });

  it("남이면 못 한다", () => {
    expect(canReviewApplications({ crt_by: "host" }, { memId: "mem-1", isAdmin: false })).toBe(false);
  });
});

describe("validateApplyMemo", () => {
  it("공백만 있으면 사유 없음(null)", () => {
    expect(validateApplyMemo("   ")).toEqual({ ok: true, value: null });
  });

  it("상한 초과는 잘라내지 않고 거부한다", () => {
    const r = validateApplyMemo("가".repeat(201));
    expect(r.ok).toBe(false);
  });

  it("정확히 상한이면 통과", () => {
    expect(validateApplyMemo("가".repeat(200)).ok).toBe(true);
  });
});

describe("applyToGathering", () => {
  it("승인제가 아닌 모임에는 신청이 성립하지 않는다", async () => {
    const { admin } = setup({ gthr: { ...BASE_GTHR, aprv_req_yn: false } });
    const r = await applyToGathering(admin, {
      gthrId: "g1", memId: "mem-1", teamId: "team-1", isAdmin: false,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("not_approval_gathering");
  });

  it("없는 모임(다른 팀 id 포함)이면 not_found", async () => {
    const { admin } = setup({ gthr: null });
    const r = await applyToGathering(admin, {
      gthrId: "g1", memId: "mem-1", teamId: "team-1", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("not_found");
  });

  it("지난 모임은 신청할 수 없다", async () => {
    const { admin } = setup({ gthr: { ...BASE_GTHR, stt_at: PAST } });
    const r = await applyToGathering(admin, {
      gthrId: "g1", memId: "mem-1", teamId: "team-1", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("past_locked");
  });

  it("이미 확정된 사람은 다시 신청하지 않는다", async () => {
    const { admin } = setup({ attending: { attd_id: "attd-1" } });
    const r = await applyToGathering(admin, {
      gthrId: "g1", memId: "mem-1", teamId: "team-1", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("already_attending");
  });

  it("이미 대기 중이면 중복 신청을 막는다", async () => {
    const { admin } = setup({ existingAply: { aply_st_cd: "pending" } });
    const r = await applyToGathering(admin, {
      gthrId: "g1", memId: "mem-1", teamId: "team-1", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("already_applied");
  });

  it("조건 미달이면 서버가 거부하고, 어떤 조건이 모자란지 함께 돌려준다", async () => {
    const { admin } = setup({
      gthr: { ...BASE_GTHR, req_attd_cnt: 6, req_attd_months: 6 },
      attdCount: 4,
    });
    const r = await applyToGathering(admin, {
      gthrId: "g1", memId: "mem-1", teamId: "team-1", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("condition_unmet");
    expect(r.ok === false && r.conditions?.conditions[0]).toMatchObject({
      label: "최근 6개월 모임 참석 6회 이상",
      met: false,
      current: "현재 4회",
    });
  });

  it("조건을 정확히 채우면 통과한다", async () => {
    const { admin } = setup({
      gthr: { ...BASE_GTHR, req_attd_cnt: 6, req_attd_months: 6 },
      attdCount: 6,
    });
    const r = await applyToGathering(admin, {
      gthrId: "g1", memId: "mem-1", teamId: "team-1", isAdmin: false,
    });
    expect(r.ok).toBe(true);
  });

  it("조건 집계는 아직 열리지 않은 모임을 빼고 센다", async () => {
    const { admin, seen } = setup({
      gthr: { ...BASE_GTHR, req_attd_cnt: 1, req_attd_months: 6 },
      attdCount: 1,
    });
    await applyToGathering(admin, { gthrId: "g1", memId: "mem-1", teamId: "team-1", isAdmin: false });

    const countQuery = seen.find((s) => s.table === "gthr_attd_rel" && s.count);
    expect(countQuery).toBeDefined();
    // stt_at 상한(lte)이 걸려 있어야 미래 모임 신청분이 안 섞인다.
    expect(countQuery!.filters.map(([c]) => c)).toContain("gthr_mst.stt_at");
    expect(countQuery!.filters.filter(([c]) => c === "gthr_mst.stt_at")).toHaveLength(2);
  });

  // 기준일은 **모임이 열리는 날**(gthr_mst.stt_at)이다. 후보가 셋이라 헷갈리기 쉽다:
  //   gthr_mst.stt_at      — 실제로 나온 날            ← 이것
  //   gthr_mst.crt_at      — 모임을 개설한 날 (3개월 전에 만들어 다음 주에 열릴 수 있다)
  //   gthr_attd_rel.crt_at — 참석 버튼을 누른 시각 (미리 신청해 두면 나오지도 않고 카운트된다)
  // 셋 중 하나로 조용히 바뀌어도 숫자만 달라질 뿐 아무 데서도 안 터지므로 여기서 못박는다.
  it("기준일은 모임 시작일(stt_at)이지 등록일(crt_at)이 아니다", async () => {
    const { admin, seen } = setup({
      gthr: { ...BASE_GTHR, req_attd_cnt: 1, req_attd_months: 6 },
      attdCount: 1,
    });
    await applyToGathering(admin, { gthrId: "g1", memId: "mem-1", teamId: "team-1", isAdmin: false });

    const cols = seen.find((s) => s.table === "gthr_attd_rel" && s.count)!.filters.map(([c]) => c);
    expect(cols.some((c) => c.includes("crt_at"))).toBe(false);
    expect(cols.filter((c) => c === "gthr_mst.stt_at")).toHaveLength(2);
  });

  it("재신청은 이전 반려 흔적을 지우고 pending 으로 되돌린다", async () => {
    const { admin, seen } = setup({ existingAply: { aply_st_cd: "rejected" } });
    const r = await applyToGathering(admin, {
      gthrId: "g1", memId: "mem-1", teamId: "team-1", isAdmin: false, memo: "홍길동",
    });
    expect(r.ok).toBe(true);

    const upsert = seen.find((s) => s.table === "gthr_aply_rel" && s.op === "upsert");
    expect(upsert!.payload).toMatchObject({
      aply_st_cd: "pending",
      aply_memo_txt: "홍길동",
      rvw_by: null,
      rvw_at: null,
      rvw_memo_txt: null,
    });
  });

  it("메모가 상한을 넘으면 저장 전에 거부한다", async () => {
    const { admin, seen } = setup();
    const r = await applyToGathering(admin, {
      gthrId: "g1", memId: "mem-1", teamId: "team-1", isAdmin: false, memo: "가".repeat(201),
    });
    expect(r.ok === false && r.code).toBe("invalid_input");
    expect(seen.some((s) => s.op === "upsert")).toBe(false);
  });
});

describe("approveApplication", () => {
  it("심사 권한이 없으면 RPC 를 부르지도 않는다", async () => {
    const { admin } = setup();
    const r = await approveApplication(admin, {
      gthrId: "g1", memId: "mem-2", teamId: "team-1", actorMemId: ACTOR.memId, isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("forbidden");
    expect(rpcCalls).toHaveLength(0);
  });

  it("개설자는 운영진이 아니어도 승인한다", async () => {
    const { admin } = setup();
    const r = await approveApplication(admin, {
      gthrId: "g1", memId: "mem-2", teamId: "team-1", actorMemId: "host", isAdmin: false,
    });
    expect(r.ok).toBe(true);
    expect(rpcCalls[0].name).toBe("approve_gthr_application");
  });

  it("정원이 찼으면 full 로 갈린다", async () => {
    const { admin } = setup({ rpcResult: "full" });
    const r = await approveApplication(admin, {
      gthrId: "g1", memId: "mem-2", teamId: "team-1", actorMemId: "host", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("full");
  });

  it("이미 처리된 신청은 not_pending", async () => {
    const { admin } = setup({ rpcResult: "not_pending" });
    const r = await approveApplication(admin, {
      gthrId: "g1", memId: "mem-2", teamId: "team-1", actorMemId: "host", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("not_pending");
  });
});

describe("rejectApplication", () => {
  it("대기 상태가 아니면(0행) not_pending — 승인된 건을 반려로 되돌리지 않는다", async () => {
    const { admin } = setup({ updateRows: [] });
    const r = await rejectApplication(admin, {
      gthrId: "g1", memId: "mem-2", teamId: "team-1", actorMemId: "host", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("not_pending");
  });

  it("UPDATE 의 WHERE 에 pending 조건이 들어간다", async () => {
    const { admin, seen } = setup();
    await rejectApplication(admin, {
      gthrId: "g1", memId: "mem-2", teamId: "team-1", actorMemId: "host", isAdmin: false,
      reason: "미입금",
    });
    const upd = seen.find((s) => s.table === "gthr_aply_rel" && s.op === "update")!;
    expect(upd.filters).toContainEqual(["aply_st_cd", "pending"]);
    expect(upd.payload).toMatchObject({ aply_st_cd: "rejected", rvw_memo_txt: "미입금" });
  });

  it("심사 권한이 없으면 거부", async () => {
    const { admin } = setup();
    const r = await rejectApplication(admin, {
      gthrId: "g1", memId: "mem-2", teamId: "team-1", actorMemId: "mem-1", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("forbidden");
  });
});

describe("cancelApplication", () => {
  it("본인 취소는 남의 신청을 건드릴 수 없다", async () => {
    const { admin } = setup();
    const r = await cancelApplication(admin, {
      gthrId: "g1", memId: "mem-2", teamId: "team-1",
      actorCd: "self", actorMemId: "mem-1", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("forbidden");
    expect(rpcCalls).toHaveLength(0);
  });

  it("본인 취소는 자기 것이면 통과", async () => {
    const { admin } = setup();
    const r = await cancelApplication(admin, {
      gthrId: "g1", memId: "mem-1", teamId: "team-1",
      actorCd: "self", actorMemId: "mem-1", isAdmin: false,
    });
    expect(r.ok).toBe(true);
    expect(rpcCalls[0].name).toBe("cancel_gthr_application");
  });

  it("대리 취소는 심사 권한이 있어야 한다", async () => {
    const { admin } = setup();
    const r = await cancelApplication(admin, {
      gthrId: "g1", memId: "mem-2", teamId: "team-1",
      actorCd: "admin", actorMemId: "mem-9", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("forbidden");
  });

  it("지난 모임은 본인 취소도 막힌다", async () => {
    const { admin } = setup({ gthr: { ...BASE_GTHR, stt_at: PAST } });
    const r = await cancelApplication(admin, {
      gthrId: "g1", memId: "mem-1", teamId: "team-1",
      actorCd: "self", actorMemId: "mem-1", isAdmin: false,
    });
    expect(r.ok === false && r.code).toBe("past_locked");
  });
});

describe("정합성 유틸", () => {
  it("backfillApprovals 는 RPC 를 부르고 처리 건수를 돌려준다", async () => {
    const { admin } = setup({ rpcResult: 3 });
    const n = await backfillApprovals(admin, { gthrId: "g1", teamId: "team-1", actorMemId: "host" });
    expect(n).toBe(3);
    expect(rpcCalls[0].name).toBe("backfill_gthr_approvals");
  });

  // 세지 못한 것을 "0건"으로 단정하면 대기자가 남은 채 승인제가 꺼진다.
  it("대기 건수 조회가 실패하면 0이 아니라 -1을 돌려준다", async () => {
    const { admin } = makeAdmin(
      { gthr_aply_rel: () => ({ count: null, error: { message: "boom" } }) },
      () => ({ data: null, error: null }),
    );
    expect(await countPendingApplications(admin, "g1")).toBe(-1);
  });
});
