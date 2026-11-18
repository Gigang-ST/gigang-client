import { describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";

import { FakeSupabase } from "./fake-supabase";

/**
 * #700 대회 MCP 도구 — `list_competitions` · `create_competition` · `register_competition`.
 *
 * 공통코드 캐시(`cmm-cd-cached`)는 `next/cache` 를 끌고 와서 vitest 에서 못 읽으니 필요한 판정 함수만 갈아 끼운다.
 * 캐시 무효화(`revalidateTag`)는 라우트 몫이라 여기엔 없다.
 */
vi.mock("@/lib/queries/cmm-cd-cached", () => ({
  isValidCompSprtCd: (rows: { cd_grp_cd: string; cd: string }[], cd: string) =>
    rows.some((r) => r.cd_grp_cd === "COMP_SPRT_CD" && r.cd === cd),
}));

import {
  createCompetitionViaMcp,
  listCompetitions,
  registerCompetitionViaMcp,
} from "@/lib/mcp/competition";

const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_TEAM = "99999999-9999-4999-8999-999999999999";
const ME = "11111111-1111-4111-8111-111111111111";
const COMP = "44444444-4444-4444-8444-444444444444";

const CMM = [
  { cd_grp_cd: "COMP_SPRT_CD", cd: "triathlon", cd_nm: "철인3종", sort_ord: 1 },
  { cd_grp_cd: "COMP_SPRT_CD", cd: "hyrox", cd_nm: "하이록스", sort_ord: 2 },
];

function ctxOf(over: Partial<OperatorContext> = {}): OperatorContext {
  return { mem_id: ME, team_id: TEAM_ID, is_admin: true, mem_nm: "운영진", ...over };
}

function validCreate(over: Record<string, unknown> = {}) {
  return {
    title: "2099 고성 아이언맨 70.3",
    sport: "triathlon",
    start_date: "2099-06-07",
    end_date: null,
    location: "강원 고성",
    event_types: ["half", "olympic"],
    source_url: "https://example.com/race",
    ...over,
  } as Parameters<typeof createCompetitionViaMcp>[2];
}

const OTHER = "33333333-3333-4333-8333-333333333333";
const TWIN_A = "55555555-5555-4555-8555-555555555551";
const TWIN_B = "55555555-5555-4555-8555-555555555552";

/** 활동 회원 한 명(team_mem_rel 행 + 임베드된 mem_mst) */
const memberRel = (mem_id: string, mem_nm: string, over: Record<string, unknown> = {}) => ({
  team_id: TEAM_ID, mem_st_cd: "active", vers: 0, del_yn: false, join_dt: "2026-01-01",
  mem_mst: { mem_id, mem_nm, del_yn: false },
  ...over,
});

const compRow = (over: Record<string, unknown> = {}) => ({
  comp_id: COMP,
  short_id: "abc123",
  comp_nm: "서울마라톤",
  comp_sprt_cd: "road_run",
  stt_dt: "2099-03-15",
  end_dt: null,
  loc_nm: "서울",
  src_url: "https://example.com",
  vers: 0,
  del_yn: false,
  comp_evt_cfg: [{ comp_evt_type: "FULL", vers: 0, del_yn: false }],
  ...over,
});

describe("create_competition", () => {
  it("admin 이 아니면 거부하고 DB 에 손대지 않는다", async () => {
    const db = new FakeSupabase();
    await expect(
      createCompetitionViaMcp(db.asClient(), ctxOf({ is_admin: false }), validCreate(), CMM),
    ).rejects.toBeInstanceOf(ToolDeniedError);
    expect(db.ops).toHaveLength(0);
  });

  it("대회와 종목을 만들고(종목은 대문자로 정규화) 감사행을 남긴다", async () => {
    const db = new FakeSupabase();
    const r = await createCompetitionViaMcp(db.asClient(), ctxOf(), validCreate(), CMM, "https://dev.gigang.team");

    expect(r.status).toBe("created");
    expect(r.competition?.event_types).toEqual(["HALF", "OLYMPIC"]);
    expect(r.comp_url).toMatch(/^https:\/\/dev\.gigang\.team\/schedule\?comp=/);
    const inserted = db.tables.comp_mst[0];
    expect(inserted).toMatchObject({ comp_nm: "2099 고성 아이언맨 70.3", crt_by: ME, comp_sprt_cd: "triathlon" });
    expect(db.tables.comp_evt_cfg.map((e) => e.comp_evt_type)).toEqual(["HALF", "OLYMPIC"]);
    expect(db.tables.mcp_audit_log[0]).toMatchObject({ tool_nm: "create_competition", actor_mem_id: ME });
    // 알림 테이블에는 손대지 않는다(웹과 같다)
    expect(Object.keys(db.tables)).not.toContain("noti_mst");
  });

  it("dry_run 은 저장하지 않는다", async () => {
    const db = new FakeSupabase();
    const r = await createCompetitionViaMcp(db.asClient(), ctxOf(), validCreate({ dry_run: true }), CMM);
    expect(r).toMatchObject({ dry_run: true, status: "would_create", competition: null });
    expect(db.opsOn("comp_mst", "insert")).toHaveLength(0);
    expect(db.opsOn("comp_evt_cfg", "insert")).toHaveLength(0);
  });

  it("같은 이름·시작일 대회가 있으면 만들지 않고 기존 것을 돌려준다(대소문자·공백 무시)", async () => {
    const db = new FakeSupabase({
      comp_mst: [compRow({ comp_nm: "2099 고성 아이언맨  70.3", stt_dt: "2099-06-07", comp_sprt_cd: "triathlon" })],
    });
    const r = await createCompetitionViaMcp(db.asClient(), ctxOf(), validCreate(), CMM);
    expect(r.status).toBe("exists");
    expect(r.competition?.comp_id).toBe(COMP);
    expect(db.opsOn("comp_mst", "insert")).toHaveLength(0);
  });

  it("이름이 같아도 날짜가 다르면 새로 만든다", async () => {
    const db = new FakeSupabase({
      comp_mst: [compRow({ comp_nm: "2099 고성 아이언맨 70.3", stt_dt: "2098-06-07" })],
    });
    const r = await createCompetitionViaMcp(db.asClient(), ctxOf(), validCreate(), CMM);
    expect(r.status).toBe("created");
  });

  it.each([
    ["지난 날짜", { start_date: "2020-01-01" }],
    ["없는 종목", { sport: "nope" }],
    ["한글 코스", { event_types: ["하프"] }],
    ["종료<시작", { end_date: "2099-06-01" }],
    ["URL 형식", { source_url: "example" }],
    ["날짜 형식", { start_date: "2099/06/07" }],
    ["하이록스 코스 아님", { sport: "hyrox", event_types: ["HALF"] }],
    ["하이록스 이름인데 종목이 다름", { title: "HYROX 서울" }],
  ])("검증 실패 — %s", async (_name, over) => {
    const db = new FakeSupabase();
    await expect(createCompetitionViaMcp(db.asClient(), ctxOf(), validCreate(over), CMM)).rejects.toBeInstanceOf(
      ToolInputError,
    );
    expect(db.opsOn("comp_mst", "insert")).toHaveLength(0);
  });

  it("종목 저장이 실패하면 만든 대회 행을 되돌린다", async () => {
    const db = new FakeSupabase();
    db.errors["comp_evt_cfg:insert"] = { message: "boom" };
    await expect(createCompetitionViaMcp(db.asClient(), ctxOf(), validCreate(), CMM)).rejects.toBeInstanceOf(
      ToolInputError,
    );
    expect(db.tables.comp_mst).toHaveLength(0);
  });
});

describe("list_competitions", () => {
  it("이름·기간으로 찾고 내 신청 상태를 붙인다(다른 팀·다른 사람 신청은 안 붙는다)", async () => {
    const db = new FakeSupabase({
      comp_mst: [
        compRow(),
        compRow({ comp_id: "c2", comp_nm: "춘천마라톤", stt_dt: "2099-10-01" }),
      ],
      comp_reg_rel: [
        {
          comp_reg_id: "r1", mem_id: ME, prt_role_cd: "participant", vers: 0, del_yn: false,
          comp_evt_cfg: { comp_evt_type: "full" },
          team_comp_plan_rel: { comp_id: COMP, team_id: TEAM_ID, vers: 0, del_yn: false },
        },
        {
          comp_reg_id: "r2", mem_id: ME, prt_role_cd: "cheering", vers: 0, del_yn: false,
          comp_evt_cfg: null,
          team_comp_plan_rel: { comp_id: "c2", team_id: OTHER_TEAM, vers: 0, del_yn: false },
        },
      ],
    });
    const all = await listCompetitions(db.asClient(), ctxOf(), {});
    expect(all.competitions.map((c) => c.comp_id).sort()).toEqual([COMP, "c2"].sort()); // (정렬은 DB 몫 — 가짜 DB 는 마지막 order 만 본다)
    expect(all.competitions.find((c) => c.comp_id === COMP)?.my_registration).toEqual({
      comp_reg_id: "r1", role: "participant", event_type: "FULL",
    });
    expect(all.competitions.find((c) => c.comp_id === "c2")?.my_registration).toBeNull();

    const byName = await listCompetitions(db.asClient(), ctxOf(), { query: "서울" });
    expect(byName.competitions.map((c) => c.comp_nm)).toEqual(["서울마라톤"]);
    const byDate = await listCompetitions(db.asClient(), ctxOf(), { from: "2099-09-01" });
    expect(byDate.competitions.map((c) => c.comp_id)).toEqual(["c2"]);
  });

  it("날짜 형식이 틀리면 거부한다", async () => {
    await expect(listCompetitions(new FakeSupabase().asClient(), ctxOf(), { from: "내일" })).rejects.toBeInstanceOf(
      ToolInputError,
    );
  });
});

describe("register_competition", () => {
  const seedComp = () =>
    new FakeSupabase({
      comp_mst: [compRow()],
      team_mem_rel: [
        memberRel(ME, "운영진"),
        memberRel(OTHER, "김철수"),
        memberRel(TWIN_A, "이영희"),
        memberRel(TWIN_B, "이영희"),
        memberRel("66666666-6666-4666-8666-666666666666", "탈퇴자", { mem_st_cd: "left" }),
      ],
    });

  it("멤버(비 admin)도 본인 신청을 할 수 있다 — 팀 대회 계획·종목을 만들고 신청 행을 넣는다", async () => {
    const db = seedComp();
    const r = await registerCompetitionViaMcp(db.asClient(), ctxOf({ is_admin: false }), {
      comp_id: COMP, role: "participant", event_type: "half",
    });
    expect(r.status).toBe("registered");
    expect(r.registration).toMatchObject({ role: "participant", event_type: "HALF" });
    expect(db.tables.team_comp_plan_rel[0]).toMatchObject({ team_id: TEAM_ID, comp_id: COMP });
    expect(db.tables.comp_evt_cfg[0]).toMatchObject({ comp_id: COMP, comp_evt_type: "HALF" });
    expect(db.tables.comp_reg_rel[0]).toMatchObject({ mem_id: ME, prt_role_cd: "participant", vers: 0, del_yn: false });
    expect(db.tables.mcp_audit_log[0]).toMatchObject({ tool_nm: "register_competition" });
    expect(Object.keys(db.tables)).not.toContain("noti_mst");
  });

  it("응원은 종목 없이 신청된다", async () => {
    const db = seedComp();
    const r = await registerCompetitionViaMcp(db.asClient(), ctxOf(), { comp_id: COMP, role: "cheering" });
    expect(r.status).toBe("registered");
    expect(db.tables.comp_reg_rel[0]).toMatchObject({ prt_role_cd: "cheering", comp_evt_id: null });
    expect(db.opsOn("comp_evt_cfg", "insert")).toHaveLength(0);
  });

  it("dry_run 은 아무것도 만들지 않는다", async () => {
    const db = seedComp();
    const r = await registerCompetitionViaMcp(db.asClient(), ctxOf(), {
      comp_id: COMP, event_type: "FULL", dry_run: true,
    });
    expect(r).toMatchObject({ dry_run: true, status: "would_register" });
    for (const t of ["team_comp_plan_rel", "comp_evt_cfg", "comp_reg_rel", "mcp_audit_log"]) {
      expect(db.opsOn(t, "insert")).toHaveLength(0);
    }
  });

  it("이미 신청돼 있으면 고치지 않고 상태를 돌려준다(다른 값을 요청했으면 안내)", async () => {
    const db = new FakeSupabase({
      comp_mst: [compRow()],
      team_mem_rel: [memberRel(ME, "운영진")],
      comp_reg_rel: [
        {
          comp_reg_id: "r1", mem_id: ME, prt_role_cd: "participant", vers: 0, del_yn: false,
          comp_evt_cfg: { comp_evt_type: "FULL" },
          team_comp_plan_rel: { comp_id: COMP, team_id: TEAM_ID, vers: 0, del_yn: false },
        },
      ],
    });
    const same = await registerCompetitionViaMcp(db.asClient(), ctxOf(), { comp_id: COMP, event_type: "full" });
    expect(same).toMatchObject({ status: "already_registered", note: null });
    expect(same.registration).toEqual({ comp_reg_id: "r1", role: "participant", event_type: "FULL" });

    const diff = await registerCompetitionViaMcp(db.asClient(), ctxOf(), { comp_id: COMP, event_type: "HALF" });
    expect(diff.status).toBe("already_registered");
    expect(diff.note).toContain("바꾸지 않았습니다");
    expect(db.opsOn("comp_reg_rel", "insert")).toHaveLength(0);
    expect(db.opsOn("comp_reg_rel", "update")).toHaveLength(0);
  });

  it("다른 팀 신청은 이 팀 신청으로 보지 않는다", async () => {
    const db = new FakeSupabase({
      comp_mst: [compRow()],
      team_mem_rel: [memberRel(ME, "운영진")],
      comp_reg_rel: [
        {
          comp_reg_id: "r9", mem_id: ME, prt_role_cd: "participant", vers: 0, del_yn: false,
          comp_evt_cfg: { comp_evt_type: "FULL" },
          team_comp_plan_rel: { comp_id: COMP, team_id: OTHER_TEAM, vers: 0, del_yn: false },
        },
      ],
    });
    const r = await registerCompetitionViaMcp(db.asClient(), ctxOf(), { comp_id: COMP, event_type: "FULL" });
    expect(r.status).toBe("registered");
  });

  it.each([
    ["참가인데 종목 없음", { comp_id: COMP }],
    ["한글 종목", { comp_id: COMP, event_type: "풀" }],
    ["없는 대회", { comp_id: "00000000-0000-4000-8000-000000000000", event_type: "FULL" }],
  ])("검증 실패 — %s", async (_n, input) => {
    const db = seedComp();
    await expect(registerCompetitionViaMcp(db.asClient(), ctxOf(), input)).rejects.toBeInstanceOf(ToolInputError);
    expect(db.opsOn("comp_reg_rel", "insert")).toHaveLength(0);
  });

  describe("관리자 대리 등록", () => {
    it("admin 은 member_id 로 다른 회원을 대신 신청한다 — 신청 행은 대상 회원 것, 감사행엔 둘 다 남는다", async () => {
      const db = seedComp();
      const r = await registerCompetitionViaMcp(db.asClient(), ctxOf(), {
        comp_id: COMP, event_type: "HALF", member_id: OTHER,
      });
      expect(r.status).toBe("registered");
      expect(r.member).toEqual({ mem_id: OTHER, mem_nm: "김철수" });
      expect(db.tables.comp_reg_rel[0]).toMatchObject({ mem_id: OTHER, prt_role_cd: "participant" });
      expect(db.tables.mcp_audit_log[0]).toMatchObject({ actor_mem_id: ME });
      expect(db.tables.mcp_audit_log[0].params_json).toMatchObject({ target_mem_id: OTHER });
      expect(Object.keys(db.tables)).not.toContain("noti_mst"); // 대상에게 알림 없음
    });

    it("이름으로 찾는다(대소문자 무시 완전일치)", async () => {
      const db = seedComp();
      const r = await registerCompetitionViaMcp(db.asClient(), ctxOf(), {
        comp_id: COMP, event_type: "FULL", member_name: "김철수",
      });
      expect(r.status).toBe("registered");
      expect(r.member?.mem_id).toBe(OTHER);
    });

    it("동명이인이면 등록하지 않고 후보만 돌려준다", async () => {
      const db = seedComp();
      const r = await registerCompetitionViaMcp(db.asClient(), ctxOf(), {
        comp_id: COMP, event_type: "FULL", member_name: "이영희",
      });
      expect(r.status).toBe("ambiguous_member");
      expect(r.candidates?.map((c) => c.mem_id).sort()).toEqual([TWIN_A, TWIN_B]);
      expect(db.opsOn("comp_reg_rel", "insert")).toHaveLength(0);
      expect(db.opsOn("team_comp_plan_rel", "insert")).toHaveLength(0);
    });

    it("대상이 이미 신청했으면 중복 등록하지 않는다", async () => {
      const db = seedComp();
      await registerCompetitionViaMcp(db.asClient(), ctxOf(), { comp_id: COMP, event_type: "FULL", member_id: OTHER });
      // 신청 행에는 임베드가 없어 조회 필터에 안 걸리므로, 웹 DB 가 돌려줄 모양으로 붙여 준다
      Object.assign(db.tables.comp_reg_rel[0], {
        comp_evt_cfg: { comp_evt_type: "FULL" },
        team_comp_plan_rel: { comp_id: COMP, team_id: TEAM_ID, vers: 0, del_yn: false },
      });
      const again = await registerCompetitionViaMcp(db.asClient(), ctxOf(), {
        comp_id: COMP, event_type: "FULL", member_id: OTHER,
      });
      expect(again.status).toBe("already_registered");
      expect(db.tables.comp_reg_rel).toHaveLength(1);
    });

    it("admin 이 아니면 다른 회원 대신 신청을 거부하고 DB 에 손대지 않는다(본인 id 는 허용)", async () => {
      const db = seedComp();
      const member = ctxOf({ is_admin: false });
      await expect(
        registerCompetitionViaMcp(db.asClient(), member, { comp_id: COMP, event_type: "FULL", member_id: OTHER }),
      ).rejects.toBeInstanceOf(ToolDeniedError);
      await expect(
        registerCompetitionViaMcp(db.asClient(), member, { comp_id: COMP, event_type: "FULL", member_name: "김철수" }),
      ).rejects.toBeInstanceOf(ToolDeniedError);
      expect(db.ops).toHaveLength(0);

      const self = await registerCompetitionViaMcp(db.asClient(), member, {
        comp_id: COMP, event_type: "FULL", member_id: ME,
      });
      expect(self.status).toBe("registered");
    });

    it("활동 중이 아니거나 없는 회원은 거부한다", async () => {
      const db = seedComp();
      for (const input of [
        { member_id: "66666666-6666-4666-8666-666666666666" },
        { member_id: "77777777-7777-4777-8777-777777777777" },
        { member_name: "없는사람" },
        { member_name: "탈퇴자" },
      ]) {
        await expect(
          registerCompetitionViaMcp(db.asClient(), ctxOf(), { comp_id: COMP, event_type: "FULL", ...input }),
        ).rejects.toBeInstanceOf(ToolInputError);
      }
      expect(db.opsOn("comp_reg_rel", "insert")).toHaveLength(0);
    });

    it("dry_run 대리 등록도 저장하지 않는다", async () => {
      const db = seedComp();
      const r = await registerCompetitionViaMcp(db.asClient(), ctxOf(), {
        comp_id: COMP, event_type: "FULL", member_id: OTHER, dry_run: true,
      });
      expect(r).toMatchObject({ status: "would_register", member: { mem_id: OTHER } });
      expect(db.opsOn("comp_reg_rel", "insert")).toHaveLength(0);
    });
  });
});
