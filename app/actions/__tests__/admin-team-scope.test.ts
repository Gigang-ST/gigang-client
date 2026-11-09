import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase } from "@/app/api/mcp/__tests__/fake-supabase";

/**
 * 관리자 액션의 팀 경계 회귀 테스트.
 *
 * 서버 액션은 service_role 로 써서 RLS 가 없다. `withAdmin` 은 "접속한 팀의 관리자인가"만 보므로,
 * 대상 id 가 그 팀 것인지 액션이 직접 확인하지 않으면 울산 관리자가 기강 데이터를 고칠 수 있다.
 * 여기서는 **울산 주소로 접속한 울산 관리자**가 기강 대상을 건드리는 상황을 재현한다.
 */

const GIGANG = "team-gigang";
const ULSAN = "team-ulsan";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  teamId: "team-ulsan",
  // 울산 주소로 접속한 울산 관리자(기강에선 일반 회원일 수도 있지만, 이 요청에선 울산 관리자다)
  member: { id: "mem-ulsan-admin", admin: true, status: "active" },
  actors: [] as { memId: string; teamId: string }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/notifications/insert-noti", () => ({
  insertNoti: vi.fn(async () => {}),
  insertNotiMany: vi.fn(async () => {}),
  insertNotiForTeam: vi.fn(async () => {}),
}));
vi.mock("@/lib/queries/cmm-cd-cached", () => ({
  getCachedCmmCdRows: async () => [],
  cmmCdRowsForGrp: () => [],
}));
vi.mock("@/lib/queries/request-team", () => ({
  getRequestTeamContext: async () => ({ teamId: h.teamId, teamCd: "ulsan" }),
}));
vi.mock("@/lib/storage/post-photo", () => ({
  postPhotoPathFromUrl: () => null,
  removePostPhoto: vi.fn(async () => {}),
  uploadPostPhoto: vi.fn(async () => ({ ok: false })),
}));
vi.mock("@/lib/titles/engine", () => ({ evaluateAndGrantTitles: vi.fn(async () => []) }));
vi.mock("@/lib/supabase/public-env", () => ({
  publicSupabaseUrl: "https://example.supabase.co",
  publicSupabaseKey: "test-key",
}));
vi.mock("@/lib/actions/auth", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAdmin: async (fn: any) => fn({ member: h.member }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withActive: async (fn: any) => fn({ member: h.member, supabase: h.db.asClient() }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withMember: async (fn: any) => fn({ member: h.member, supabase: h.db.asClient() }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAdminOrThrow: async (fn: any) => fn({ member: h.member, supabase: h.db.asClient() }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => h.db.asClient(),
  createUntypedAdminClient: () => h.db.asClient(),
  // 행위자 헤더는 DB 트리거가 읽는다 — 여기선 같은 가짜 DB 를 돌려주고 받은 행위자만 남긴다
  createAdminClientAs: (actor: { memId: string; teamId: string }) => {
    h.actors.push(actor);
    return h.db.asClient();
  },
}));

import { grantTitle as grantTitleFromMembers } from "@/app/actions/admin/grant-title";
import { grantTitle as grantTitleFromTitles } from "@/app/actions/admin/manage-title";
import { revokeTitle as revokeTitleFromMembers } from "@/app/actions/admin/revoke-title";
import {
  approveParticipation,
  deleteParticipation,
  updateMultiplier,
} from "@/app/actions/admin/manage-mileage";
import { deleteActivity, joinProject, updateMonthlyGoal } from "@/app/actions/mileage-run";
import { deleteRecord } from "@/app/actions/admin/manage-record";
import { deleteRegistration } from "@/app/actions/admin/manage-competition";
import { sendNotification } from "@/app/actions/admin/send-notification";
import { createComment } from "@/app/actions/comment/manage-comment";
import { deletePost } from "@/app/actions/delete-post";
import { createExemption } from "@/app/actions/dues/create-exemption";
import { respondFeedback } from "@/app/actions/feedback/respond-feedback";
import { updateFeedbackStatus } from "@/app/actions/feedback/update-feedback-status";
import { insertNotiMany } from "@/lib/notifications/insert-noti";

beforeEach(() => {
  h.teamId = ULSAN;
  h.db = new FakeSupabase({
    team_mem_rel: [
      { team_mem_id: "tm-gigang", team_id: GIGANG, mem_id: "mem-a", vers: 0, del_yn: false },
      { team_mem_id: "tm-ulsan", team_id: ULSAN, mem_id: "mem-b", vers: 0, del_yn: false },
    ],
    ttl_mst: [
      { ttl_id: "ttl-gigang", team_id: GIGANG, ttl_nm: "기강인", vers: 0, del_yn: false },
      { ttl_id: "ttl-ulsan", team_id: ULSAN, ttl_nm: "울산인", vers: 0, del_yn: false },
    ],
    evt_team_mst: [
      { evt_id: "evt-gigang", team_id: GIGANG, evt_type_cd: "MILEAGE_RUN", stt_dt: "2026-09-01", end_dt: "2026-12-31" },
      { evt_id: "evt-ulsan", team_id: ULSAN, evt_type_cd: "MILEAGE_RUN", stt_dt: "2026-09-01", end_dt: "2026-12-31" },
    ],
    evt_mlg_mult_cfg: [{ mult_id: "mult-gigang", evt_id: "evt-gigang", mult_nm: "추석", mult_val: 2 }],
    evt_team_prt_rel: [
      { prt_id: "prt-gigang", evt_id: "evt-gigang", mem_id: "mem-a", aprv_yn: false },
      { prt_id: "prt-ulsan", evt_id: "evt-ulsan", mem_id: "mem-b", aprv_yn: false },
    ],
    evt_mlg_act_hist: [
      // 임베디드 관계(`evt_team_prt_rel!inner(...)`)는 가짜 DB가 조인하지 않아 행에 미리 넣어 둔다
      {
        act_id: "act-gigang",
        prt_id: "prt-gigang",
        act_dt: "2026-11-08",
        photo_url: null,
        evt_team_prt_rel: { mem_id: "mem-a", evt_id: "evt-gigang" },
      },
    ],
    evt_mlg_mth_snap: [
      {
        goal_id: "goal-gigang",
        prt_id: "prt-gigang",
        goal_mlg: 100,
        evt_team_prt_rel: { mem_id: "mem-a", evt_id: "evt-gigang" },
      },
    ],
    rec_race_hist: [{ race_result_id: "rec-a", mem_id: "mem-a", rec_time_sec: 3600 }],
    brd_post_mst: [{ post_id: "brd-gigang", team_id: GIGANG, del_yn: false }],
    fdbk_mst: [
      { fdbk_id: "fb-gigang", team_id: GIGANG, mem_id: "mem-a", cont_txt: "기강 건의", stts_enm: "open", adm_note_txt: null, del_yn: false },
    ],
    comp_reg_rel: [
      // 임베디드 관계(team_comp_plan_rel!inner)는 가짜 DB 가 조인하지 않아 행에 미리 넣어 둔다
      { comp_reg_id: "reg-gigang", team_comp_id: "plan-gigang", team_comp_plan_rel: { team_id: GIGANG } },
    ],
    gthr_mst: [{ gthr_id: "9a1b2c3d-0000-4000-8000-000000000001", team_id: GIGANG, crt_by: "mem-a" }],
    mem_ttl_rel: [
      {
        mem_ttl_id: "mt-gigang",
        team_id: GIGANG,
        team_mem_id: "tm-gigang",
        ttl_id: "ttl-gigang",
        is_prmy_yn: true,
        vers: 0,
        del_yn: false,
      },
    ],
  });
});

describe("칭호 수여 — 회원 관리 화면(grant-title)", () => {
  it("다른 팀 회원에게는 줄 수 없다", async () => {
    const res = await grantTitleFromMembers("tm-gigang", "ttl-ulsan");
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("mem_ttl_rel", "insert")).toHaveLength(0);
  });

  it("다른 팀 칭호는 줄 수 없다", async () => {
    const res = await grantTitleFromMembers("tm-ulsan", "ttl-gigang");
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("mem_ttl_rel", "insert")).toHaveLength(0);
  });

  it("우리 팀 회원·우리 팀 칭호면 접속한 팀으로 기록된다", async () => {
    const res = await grantTitleFromMembers("tm-ulsan", "ttl-ulsan");
    expect(res.ok).toBe(true);
    const [insert] = h.db.opsOn("mem_ttl_rel", "insert");
    expect(insert.payload).toMatchObject({ team_id: ULSAN, team_mem_id: "tm-ulsan", ttl_id: "ttl-ulsan" });
  });
});

describe("칭호 수여 — 칭호 관리 화면(manage-title)", () => {
  it("다른 팀 칭호는 줄 수 없다", async () => {
    const res = await grantTitleFromTitles("ttl-gigang", "tm-ulsan", null);
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("mem_ttl_rel", "insert")).toHaveLength(0);
  });

  it("다른 팀 회원에게 대표로 주려 해도 그 회원의 대표 칭호를 건드리지 않는다", async () => {
    const res = await grantTitleFromTitles("ttl-ulsan", "tm-gigang", null, true);
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("mem_ttl_rel", "update")).toHaveLength(0);
    expect(h.db.tables.mem_ttl_rel.find((r) => r.mem_ttl_id === "mt-gigang")?.is_prmy_yn).toBe(true);
  });
});

describe("칭호 회수 — 회원 관리 화면(revoke-title)", () => {
  it("다른 팀 보유 칭호는 회수할 수 없다", async () => {
    const res = await revokeTitleFromMembers("mt-gigang");
    expect(res.ok).toBe(false);
    expect(h.db.tables.mem_ttl_rel.find((r) => r.mem_ttl_id === "mt-gigang")?.del_yn).toBe(false);
  });

  it("같은 팀이면 회수된다", async () => {
    h.teamId = GIGANG;
    const res = await revokeTitleFromMembers("mt-gigang");
    expect(res.ok).toBe(true);
    expect(h.db.tables.mem_ttl_rel.find((r) => r.mem_ttl_id === "mt-gigang")?.del_yn).toBe(true);
  });
});

describe("마일리지런 관리 — 배율·참가자(manage-mileage)", () => {
  it("다른 팀 시즌의 배율은 고칠 수 없다", async () => {
    const res = await updateMultiplier("mult-gigang", {
      mult_nm: "바뀜",
      mult_val: 9,
      stt_dt: null,
      end_dt: null,
      active_yn: true,
    });
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("evt_mlg_mult_cfg", "update")).toHaveLength(0);
  });

  it("다른 팀 참가자는 승인·삭제할 수 없다", async () => {
    expect((await approveParticipation("prt-gigang")).ok).toBe(false);
    expect((await deleteParticipation("prt-gigang")).ok).toBe(false);
    expect(h.db.opsOn("evt_team_prt_rel", "update")).toHaveLength(0);
    expect(h.db.opsOn("evt_team_prt_rel", "delete")).toHaveLength(0);
  });

  it("우리 팀 참가자는 승인된다", async () => {
    expect((await approveParticipation("prt-ulsan")).ok).toBe(true);
    expect(h.db.tables.evt_team_prt_rel.find((r) => r.prt_id === "prt-ulsan")?.aprv_yn).toBe(true);
  });
});

describe("마일리지런 회원 액션 — 관리자 특권은 접속한 팀 시즌에서만(mileage-run)", () => {
  it("다른 팀 시즌에는 참가 신청할 수 없다", async () => {
    const res = await joinProject("evt-gigang", 100, false);
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("evt_team_prt_rel", "insert")).toHaveLength(0);
  });

  it("울산 관리자는 기강 회원의 활동 기록을 지울 수 없다", async () => {
    const res = await deleteActivity("act-gigang");
    expect(res.ok).toBe(false);
    expect(h.db.tables.evt_mlg_act_hist).toHaveLength(1);
  });

  it("울산 관리자는 기강 회원의 월 목표를 고칠 수 없다", async () => {
    const res = await updateMonthlyGoal("goal-gigang", 10);
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("evt_mlg_mth_snap", "update")).toHaveLength(0);
  });
});

describe("게시판·대회 기록·댓글·알림·회비", () => {
  it("다른 팀 공지는 지울 수 없다", async () => {
    await expect(deletePost("brd-gigang")).rejects.toThrow();
    expect(h.db.tables.brd_post_mst[0].del_yn).toBe(false);
  });

  it("우리 팀 회원이 아닌 사람의 대회 기록은 지울 수 없다", async () => {
    const res = await deleteRecord("rec-a");
    expect(res.ok).toBe(false);
    expect(h.db.tables.rec_race_hist).toHaveLength(1);
  });

  it("기록 주인이 우리 팀 회원이면 지울 수 있다(기록은 사람 것)", async () => {
    h.teamId = GIGANG;
    expect((await deleteRecord("rec-a")).ok).toBe(true);
    expect(h.db.tables.rec_race_hist).toHaveLength(0);
  });

  it("다른 팀 모임에는 댓글을 달 수 없다", async () => {
    const res = await createComment({
      entityType: "gathering",
      entityId: "9a1b2c3d-0000-4000-8000-000000000001",
      contTxt: "안녕",
      mentionedMemIds: [],
    });
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("cmnt_mst", "insert")).toHaveLength(0);
  });

  it("관리자 알림은 우리 팀 회원에게만 간다", async () => {
    vi.mocked(insertNotiMany).mockClear();
    const res = await sendNotification({ target: ["mem-a", "mem-b"], notiNm: "공지" });
    expect(res.ok).toBe(true);
    expect(vi.mocked(insertNotiMany).mock.calls[0][0]).toMatchObject({ memIds: ["mem-b"] });
  });

  it("다른 팀 회원에게는 회비 면제를 걸 수 없다", async () => {
    const res = await createExemption({
      memId: "mem-a",
      exmTpEnm: "full",
      aplySttDt: "2026-11-01",
      aplyEndDt: "2026-12-31",
      rsnTxt: "부상",
    });
    expect(res.ok).toBe(false);
    expect(h.db.opsOn("fee_due_exm_cfg", "insert")).toHaveLength(0);
  });
});

describe("변경 이력 행위자 · 대회 참가 신청", () => {
  it("기록을 지울 땐 행위자(누가·어느 팀)를 실어 보낸다 — 지운 기록이 이력에 남는다", async () => {
    h.teamId = GIGANG;
    h.actors.length = 0;
    expect((await deleteRecord("rec-a")).ok).toBe(true);
    expect(h.actors).toContainEqual({ memId: "mem-ulsan-admin", teamId: GIGANG });
  });

  it("다른 팀 회원의 대회 참가 신청은 지울 수 없다", async () => {
    const res = await deleteRegistration("reg-gigang");
    expect(res.ok).toBe(false);
    expect(h.db.tables.comp_reg_rel).toHaveLength(1);
  });

  it("우리 팀 신청은 지운다", async () => {
    h.teamId = GIGANG;
    expect((await deleteRegistration("reg-gigang")).ok).toBe(true);
    expect(h.db.tables.comp_reg_rel).toHaveLength(0);
  });
});

describe("건의 — 그 팀 운영진만", () => {
  it("다른 팀 건의의 상태는 바꿀 수 없다", async () => {
    const res = await updateFeedbackStatus("fb-gigang", "resolved");
    expect(res.ok).toBe(false);
    expect(h.db.tables.fdbk_mst[0].stts_enm).toBe("open");
  });

  it("다른 팀 건의에는 답변을 달 수 없고 알림도 안 간다", async () => {
    const res = await respondFeedback("fb-gigang", "확인했어요");
    expect(res.ok).toBe(false);
    expect(h.db.tables.fdbk_mst[0].adm_note_txt).toBeNull();
  });

  it("우리 팀 건의는 처리한다", async () => {
    h.teamId = GIGANG;
    expect((await updateFeedbackStatus("fb-gigang", "resolved")).ok).toBe(true);
    expect(h.db.tables.fdbk_mst[0].stts_enm).toBe("resolved");
  });
});
