import { beforeEach, describe, expect, it, vi } from "vitest";

import { planStartInfoSave, type StartInfoExisting } from "@/lib/start-info-plan";
import { EMPTY_START_INFO, type StartInfoValues } from "@/lib/validations/start-info";

const h = vi.hoisted(() => ({
  prf: null as Record<string, unknown> | null,
  recs: [] as { dist_cd: string; rec_sec: number }[],
  calls: [] as { table: string; op: string; payload?: unknown; filter?: unknown }[],
  fail: null as string | null,
  member: null as { id: string; status: string } | null,
}));

vi.mock("server-only", () => ({}));
// 요청 팀의 가입 설정 — 러닝 프로필 사용 여부(팀 설정 feature.running_profile). 기본 켬, 테스트마다 바꾼다
const signup = vi.hoisted(() => ({ runningProfile: true }));
vi.mock("@/lib/queries/team-signup", () => ({
  getRequestTeamSignup: async () => ({
    steps: signup.runningProfile
      ? ["시작", "로그인", "기본 정보", "러닝 프로필", "가입 목적", "참석 약속"]
      : ["시작", "로그인", "기본 정보", "가입 목적", "참석 약속"],
    joinPurposes: [],
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dayjs", () => ({ dayjs: () => ({ toISOString: () => "2026-11-20T00:00:00.000Z" }) }));
vi.mock("@/lib/queries/member", () => ({
  getCurrentMember: async () => ({ user: null, member: h.member, supabase: {} }),
}));
vi.mock("@/lib/inactive-notice", () => ({ buildInactiveActionMessage: () => "inactive" }));

vi.mock("@/lib/supabase/admin", () => ({
  createUntypedAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (...f: unknown[]) => {
          h.calls.push({ table, op: "eq", filter: f });
          return b;
        },
        maybeSingle: async () => ({ data: h.prf, error: null }),
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: table === "mem_start_rec_rel" ? h.recs : null, error: null }),
        upsert: async (payload: unknown) => {
          h.calls.push({ table, op: "upsert", payload });
          return { error: h.fail ? { message: h.fail } : null };
        },
        insert: async (payload: unknown) => {
          h.calls.push({ table, op: "insert", payload });
          return { error: null };
        },
        update: (payload: unknown) => {
          h.calls.push({ table, op: "update", payload });
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
        delete: () => ({
          eq: () => ({
            in: async (_c: string, v: unknown) => {
              h.calls.push({ table, op: "delete", filter: v });
              return { error: null };
            },
          }),
        }),
      };
      return b;
    },
  }),
}));

import { updateStartInfo } from "@/app/actions/profile/update-start-info";
import { saveStartInfo } from "@/lib/start-info-save";

const rec = (distCd: "10K" | "HALF" | "FULL" | "5K", recSec: number) => ({ distCd, recSec });
const info = (p: Partial<StartInfoValues>): StartInfoValues => ({ ...EMPTY_START_INFO, ...p });
const none: StartInfoExisting = { hadBefore: false, values: EMPTY_START_INFO };
const had = (p: Partial<StartInfoValues>): StartInfoExisting => ({ hadBefore: true, values: info(p) });

describe("planStartInfoSave — 계획", () => {
  it("처음이고 비어 있으면 아무것도 안 쓴다(입력 시각도 안 만든다)", () => {
    expect(planStartInfoSave(none, EMPTY_START_INFO, "SIGNUP")).toEqual({ skip: true });
    expect(planStartInfoSave(none, EMPTY_START_INFO, "PROFILE")).toEqual({ skip: true });
  });

  it("처음 입력하면 출처·시각을 적는다(first)", () => {
    const p = planStartInfoSave(none, info({ runCareerCd: "NEW", records: [rec("10K", 3300)] }), "SIGNUP");
    expect(p).toMatchObject({ skip: false, prf: { first: true, runCareerCd: "NEW" }, inserts: [rec("10K", 3300)], removed: [] });
  });

  it("프로필 저장 — 기존 시각 보존(first=false), 추가·수정·삭제를 가른다", () => {
    const p = planStartInfoSave(
      had({ records: [rec("10K", 3300), rec("HALF", 7200)] }),
      info({ records: [rec("10K", 3200), rec("FULL", 15000)] }),
      "PROFILE",
    );
    expect(p).toMatchObject({
      skip: false,
      prf: { first: false },
      updates: [rec("10K", 3200)],
      inserts: [rec("FULL", 15000)],
      removed: ["HALF"],
    });
  });

  it("프로필에서 전부 비우면 반영한다(기존 값이 있을 때만)", () => {
    const p = planStartInfoSave(
      had({ runCareerCd: "Y1_3", records: [rec("10K", 3300)] }),
      EMPTY_START_INFO,
      "PROFILE",
    );
    expect(p).toMatchObject({ skip: false, prf: { runCareerCd: null, wklyDistCd: null, recNone: false }, removed: ["10K"] });
  });

  it("가입 폼(SIGNUP) + 기존 값 — 빈 입력이면 건드리지 않는다", () => {
    expect(planStartInfoSave(had({ runCareerCd: "Y1_3" }), EMPTY_START_INFO, "SIGNUP")).toEqual({ skip: true });
  });

  it("가입 폼(SIGNUP) + 기존 값 — 입력한 칸만 병합하고 기존 기록은 지우지 않는다", () => {
    const p = planStartInfoSave(
      had({ runCareerCd: "Y1_3", wklyDistCd: "KM10_30", records: [rec("10K", 3300), rec("HALF", 7200)] }),
      info({ wklyDistCd: "KM30_50", records: [rec("10K", 3000)] }),
      "SIGNUP",
    );
    expect(p).toMatchObject({
      skip: false,
      prf: { runCareerCd: "Y1_3", wklyDistCd: "KM30_50", recNone: false, first: false },
      updates: [rec("10K", 3000)],
      inserts: [],
      removed: [],
    });
  });

  it("가입 폼 병합 — 완주 못 해봄: 기존 기록이 있으면 켜지 않고, 없으면 켠다", () => {
    const withRec = planStartInfoSave(had({ records: [rec("10K", 3300)] }), info({ recNone: true }), "SIGNUP");
    expect(withRec).toMatchObject({ prf: { recNone: false }, removed: [] });
    const noRec = planStartInfoSave(had({ runCareerCd: "NEW" }), info({ recNone: true }), "SIGNUP");
    expect(noRec).toMatchObject({ prf: { recNone: true, runCareerCd: "NEW" } });
  });

  it("가입 폼 병합 — 기존이 완주 못 해봄이고 기록을 적으면 해제한다", () => {
    const p = planStartInfoSave(had({ recNone: true }), info({ records: [rec("10K", 3300)] }), "SIGNUP");
    expect(p).toMatchObject({ prf: { recNone: false }, inserts: [rec("10K", 3300)] });
  });
});

describe("saveStartInfo — 실행", () => {
  beforeEach(() => {
    h.prf = null;
    h.recs = [];
    h.calls = [];
    h.fail = null;
  });

  it("값이 잘못되면 DB 에 가기 전에 거절한다", async () => {
    const r = await saveStartInfo("m1", { ...EMPTY_START_INFO, recNone: true, records: [rec("10K", 3000)] }, "SIGNUP");
    expect(r.ok).toBe(false);
    expect(h.calls).toEqual([]);
  });

  it("비어 있고 처음이면 쓰기가 없다", async () => {
    expect((await saveStartInfo("m1", EMPTY_START_INFO, "SIGNUP")).ok).toBe(true);
    expect(h.calls.filter((c) => c.op !== "eq")).toEqual([]);
  });

  it("처음 저장: 출처·처음 시각을 싣고 기록은 insert(출처 포함)", async () => {
    await saveStartInfo("m1", info({ runCareerCd: "NEW", records: [rec("10K", 3300)] }), "SIGNUP");
    const up = h.calls.find((c) => c.op === "upsert")!.payload as Record<string, unknown>;
    expect(up).toMatchObject({ start_info_src_cd: "SIGNUP", start_info_at: "2026-11-20T00:00:00.000Z", run_career_cd: "NEW" });
    expect(h.calls.find((c) => c.op === "insert")!.payload).toMatchObject({ dist_cd: "10K", rec_sec: 3300, src_cd: "SIGNUP" });
  });

  it("다시 저장(프로필): 처음 출처·시각은 싣지 않고, 수정·삭제·추가를 실행한다", async () => {
    h.prf = { start_info_at: "2026-01-01T00:00:00Z", run_career_cd: "NEW", start_rec_none_yn: false };
    h.recs = [{ dist_cd: "10K", rec_sec: 3300 }, { dist_cd: "HALF", rec_sec: 7200 }];
    await saveStartInfo("m1", info({ runCareerCd: "NEW", records: [rec("10K", 3200), rec("FULL", 15000)] }), "PROFILE");
    const up = h.calls.find((c) => c.op === "upsert")!.payload as Record<string, unknown>;
    expect("start_info_src_cd" in up).toBe(false);
    expect("start_info_at" in up).toBe(false);
    expect(up.start_info_upd_at).toBe("2026-11-20T00:00:00.000Z");
    expect(h.calls.find((c) => c.op === "delete")!.filter).toEqual(["HALF"]);
    expect(h.calls.find((c) => c.op === "update")!.payload).toEqual({ rec_sec: 3200 });
    expect(h.calls.find((c) => c.op === "insert")!.payload).toMatchObject({ dist_cd: "FULL", src_cd: "PROFILE" });
  });

  it("가입 폼 + 기존 값: 기존 기록을 지우지 않는다", async () => {
    h.prf = { start_info_at: "2026-01-01T00:00:00Z", run_career_cd: "Y1_3", start_rec_none_yn: false };
    h.recs = [{ dist_cd: "HALF", rec_sec: 7200 }];
    await saveStartInfo("m1", info({ wklyDistCd: "KM10_30" }), "SIGNUP");
    expect(h.calls.some((c) => c.op === "delete")).toBe(false);
    expect(h.calls.find((c) => c.op === "upsert")!.payload).toMatchObject({ run_career_cd: "Y1_3", wkly_dist_cd: "KM10_30" });
  });

  it("DB 오류는 실패로 돌려준다", async () => {
    h.fail = "boom";
    const r = await saveStartInfo("m1", info({ runCareerCd: "NEW" }), "SIGNUP");
    expect(r.ok).toBe(false);
  });
});

describe("updateStartInfo — 권한·입력", () => {
  beforeEach(() => {
    h.prf = null;
    h.recs = [];
    h.calls = [];
    h.fail = null;
    h.member = null;
    signup.runningProfile = true;
  });

  it("로그인 안 했으면 저장하지 않는다", async () => {
    await expect(updateStartInfo(info({ runCareerCd: "NEW" }))).rejects.toThrow();
    expect(h.calls).toEqual([]);
  });

  it("탈퇴(left) 회원은 막힌다", async () => {
    h.member = { id: "m1", status: "left" };
    await expect(updateStartInfo(info({ runCareerCd: "NEW" }))).rejects.toThrow();
    expect(h.calls).toEqual([]);
  });

  it("잘못된 입력은 세션 확인 전에 거절", async () => {
    const r = await updateStartInfo({ ...EMPTY_START_INFO, recNone: true, records: [rec("10K", 3000)] });
    expect(r).toEqual({ ok: false, message: "입력값이 올바르지 않습니다." });
  });

  it("본인(세션의 mem_id)만 저장한다", async () => {
    h.member = { id: "m1", status: "active" };
    const r = await updateStartInfo(info({ runCareerCd: "NEW" }));
    expect(r).toEqual({ ok: true });
    expect(h.calls.find((c) => c.op === "upsert")!.payload).toMatchObject({ mem_id: "m1" });
  });

  it("러닝 프로필을 안 쓰는 팀(모비)은 받지 않는다 — 화면에 칸이 없어도 액션은 직접 부를 수 있다", async () => {
    h.member = { id: "m1", status: "active" };
    signup.runningProfile = false;
    const r = await updateStartInfo(info({ runCareerCd: "NEW" }));
    expect(r).toEqual({ ok: false, message: "이 크루에서는 러닝 프로필을 쓰지 않아요." });
    expect(h.calls).toEqual([]);
  });
});
