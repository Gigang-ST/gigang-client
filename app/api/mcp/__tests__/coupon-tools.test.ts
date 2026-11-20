import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { issueCouponsViaMcp, listCouponsViaMcp } from "@/lib/mcp/coupons";
import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

import { FakeSupabase } from "./fake-supabase";

const TEAM = "22222222-2222-4222-8222-222222222222";
const ADMIN = "11111111-1111-4111-8111-111111111111";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const M2 = "aaaaaaaa-0000-4000-8000-000000000002";

const ctx = (o: Partial<OperatorContext> = {}): OperatorContext => ({
  mem_id: ADMIN,
  team_id: TEAM,
  is_admin: true,
  mem_nm: "관리자",
  ...o,
});

function setup() {
  const fake = new FakeSupabase({
    team_mem_rel: [
      { mem_id: M1, team_id: TEAM, vers: 0, del_yn: false },
      { mem_id: M2, team_id: TEAM, vers: 0, del_yn: false },
    ],
    cpn_mst: [],
    mcp_audit_log: [],
  });
  return { fake, db: fake as unknown as SupabaseClient<Database> };
}

const items = [
  { memId: M1, cpnTpCd: "SINGLET" as const, cpnTxt: "싱글렛 1만원 할인", cpnAmt: 10000, expDt: "2099-12-31" },
  { memId: M2, cpnTpCd: "COMP_SUPPORT" as const, cpnTxt: "대회 참가비 50% 지원" },
];

describe("issue_coupons", () => {
  it("admin 이 아니면 거부", async () => {
    const { db } = setup();
    await expect(issueCouponsViaMcp(db, ctx({ is_admin: false }), { items })).rejects.toBeInstanceOf(ToolDeniedError);
  });

  it("dry_run 은 쓰지도 감사행을 남기지도 않는다", async () => {
    const { fake, db } = setup();
    const r = await issueCouponsViaMcp(db, ctx(), { items, dryRun: true });
    expect(r).toMatchObject({ dry_run: true, issued: 2, audit_id: null });
    expect(fake.tables.cpn_mst).toHaveLength(0);
    expect(fake.tables.mcp_audit_log).toHaveLength(0);
  });

  it("발급하면 감사행에 건수·id 만 남고 내용·금액·회원은 안 실린다", async () => {
    const { fake, db } = setup();
    const r = await issueCouponsViaMcp(db, ctx(), { items });
    expect(r.issued).toBe(2);
    expect(fake.tables.cpn_mst).toHaveLength(2);
    const audit = JSON.stringify(fake.tables.mcp_audit_log[0]);
    expect(audit).toContain("issue_coupons");
    expect(audit).not.toContain("싱글렛");
    expect(audit).not.toContain("10000");
    expect(audit).not.toContain(M1);
  });
});

describe("list_coupons", () => {
  it("admin 은 전체, 일반 회원은 mem_id 를 줘도 내 것만", async () => {
    const { db } = setup();
    await issueCouponsViaMcp(db, ctx(), { items });
    const all = await listCouponsViaMcp(db, ctx(), {});
    expect(all.count).toBe(2);
    const mine = await listCouponsViaMcp(db, ctx({ mem_id: M1, is_admin: false }), { memId: M2 });
    expect(mine.coupons.map((c) => c.mem_id)).toEqual([M1]);
    expect(mine.coupons[0]).toMatchObject({ status: "active", amount: 10000, type_label: "싱글렛 할인권" });
  });
});
