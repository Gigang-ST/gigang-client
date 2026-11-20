import { describe, expect, it } from "vitest";

import { cancelCouponCore, issueCouponsCore, listCouponsCore, unredeemCouponCore, redeemCouponCore } from "@/lib/coupon/core";
import { couponStatus } from "@/lib/coupon/status";
import { FakeSupabase } from "@/app/api/mcp/__tests__/fake-supabase";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const TEAM = "22222222-2222-4222-8222-222222222222";
const OTHER_TEAM = "33333333-3333-4333-8333-333333333333";
const ADMIN = "11111111-1111-4111-8111-111111111111";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const OUTSIDER = "aaaaaaaa-0000-4000-8000-000000000009";

function setup() {
  const fake = new FakeSupabase({
    team_mem_rel: [{ mem_id: M1, team_id: TEAM, vers: 0, del_yn: false }],
    cpn_mst: [],
  });
  return { fake, db: fake as unknown as SupabaseClient<Database> };
}

const item = (over = {}) => ({ memId: M1, cpnTpCd: "SINGLET" as const, cpnTxt: "싱글렛 1만원 할인", ...over });

describe("couponStatus", () => {
  it("사용했으면 기간과 무관하게 used", () => {
    expect(couponStatus({ used_yn: true, exp_dt: "2020-01-01" }, "2026-11-20")).toBe("used");
  });
  it("만료일 당일은 아직 쓸 수 있고 다음 날부터 expired", () => {
    expect(couponStatus({ used_yn: false, exp_dt: "2026-11-20" }, "2026-11-20")).toBe("active");
    expect(couponStatus({ used_yn: false, exp_dt: "2026-11-19" }, "2026-11-20")).toBe("expired");
  });
  it("기한 없음은 만료되지 않는다", () => {
    expect(couponStatus({ used_yn: false, exp_dt: null }, "2099-01-01")).toBe("active");
  });
});

describe("issueCouponsCore", () => {
  it("금액·유효기간을 비워도 발급된다", async () => {
    const { fake, db } = setup();
    const r = await issueCouponsCore(db, { teamId: TEAM, regMemId: ADMIN, items: [item()] });
    expect(r).toMatchObject({ ok: true, issued: 1 });
    expect(fake.tables.cpn_mst[0]).toMatchObject({ team_id: TEAM, mem_id: M1, cpn_amt: null, exp_dt: null, reg_by_mem_id: ADMIN });
  });

  it("dry_run 은 쓰지 않는다", async () => {
    const { fake, db } = setup();
    const r = await issueCouponsCore(db, { teamId: TEAM, regMemId: ADMIN, items: [item()], dryRun: true });
    expect(r).toMatchObject({ ok: true, issued: 1, dryRun: true });
    expect(fake.tables.cpn_mst).toHaveLength(0);
  });

  it("다른 팀 회원·빈 내용·음수 금액은 skipped 로 빠지고 나머지는 진행", async () => {
    const { fake, db } = setup();
    const r = await issueCouponsCore(db, {
      teamId: TEAM,
      regMemId: ADMIN,
      items: [item(), item({ memId: OUTSIDER }), item({ cpnTxt: "  " }), item({ cpnAmt: -1 })],
    });
    expect(r).toMatchObject({ ok: true, issued: 1 });
    if (r.ok) expect(r.skipped.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(fake.tables.cpn_mst).toHaveLength(1);
  });

  it("전부 걸리면 아무것도 쓰지 않는다", async () => {
    const { fake, db } = setup();
    const r = await issueCouponsCore(db, { teamId: TEAM, regMemId: ADMIN, items: [item({ memId: OUTSIDER })] });
    expect(r).toMatchObject({ ok: true, issued: 0 });
    expect(fake.tables.cpn_mst).toHaveLength(0);
  });
});

describe("listCouponsCore", () => {
  it("팀·회원·상태로 거르고 취소분은 뺀다", async () => {
    const { fake, db } = setup();
    const base = { team_id: TEAM, mem_id: M1, cpn_tp_cd: "ETC", cpn_txt: "x", cpn_amt: null, used_dt: null, used_memo_txt: null, vers: 0 };
    fake.tables.cpn_mst.push(
      { ...base, cpn_id: "a", exp_dt: null, used_yn: false, del_yn: false, crt_at: "2026-11-20T01:00:00Z" },
      { ...base, cpn_id: "b", exp_dt: "2026-01-01", used_yn: false, del_yn: false, crt_at: "2026-11-20T02:00:00Z" },
      { ...base, cpn_id: "c", exp_dt: null, used_yn: true, del_yn: false, crt_at: "2026-11-20T03:00:00Z" },
      { ...base, cpn_id: "d", exp_dt: null, used_yn: false, del_yn: true, crt_at: "2026-11-20T04:00:00Z" },
      { ...base, cpn_id: "e", team_id: OTHER_TEAM, exp_dt: null, used_yn: false, del_yn: false, crt_at: "2026-11-20T05:00:00Z" },
    );
    const all = await listCouponsCore(db, { teamId: TEAM, today: "2026-11-20" });
    expect(all.map((c) => c.cpn_id).sort()).toEqual(["a", "b", "c"]);
    const expired = await listCouponsCore(db, { teamId: TEAM, status: "expired", today: "2026-11-20" });
    expect(expired.map((c) => c.cpn_id)).toEqual(["b"]);
  });
});

describe("사용·취소", () => {
  async function issued() {
    const { fake, db } = setup();
    await issueCouponsCore(db, { teamId: TEAM, regMemId: ADMIN, items: [item({ expDt: "2026-12-31" })] });
    return { fake, db, id: fake.tables.cpn_mst[0].cpn_id as string };
  }

  it("사용 처리는 사용일·메모를 남기고 두 번은 안 된다", async () => {
    const { fake, db, id } = await issued();
    expect(await redeemCouponCore(db, { teamId: TEAM, usedByMemId: ADMIN, cpnId: id, usedDt: "2026-11-21", memo: "싱글렛 구매" })).toEqual({ ok: true });
    expect(fake.tables.cpn_mst[0]).toMatchObject({ used_yn: true, used_dt: "2026-11-21", used_memo_txt: "싱글렛 구매", used_by_mem_id: ADMIN });
    const again = await redeemCouponCore(db, { teamId: TEAM, usedByMemId: ADMIN, cpnId: id });
    expect(again).toMatchObject({ ok: false });
  });

  it("유효기간이 지난 쿠폰은 사용 처리할 수 없다", async () => {
    const { db, id } = await issued();
    const r = await redeemCouponCore(db, { teamId: TEAM, usedByMemId: ADMIN, cpnId: id, usedDt: "2027-01-01" });
    expect(r).toMatchObject({ ok: false, message: "유효기간이 지난 쿠폰이에요." });
  });

  it("다른 팀 쿠폰은 건드릴 수 없다", async () => {
    const { db, id } = await issued();
    expect(await redeemCouponCore(db, { teamId: OTHER_TEAM, usedByMemId: ADMIN, cpnId: id })).toMatchObject({ ok: false });
    expect(await cancelCouponCore(db, { teamId: OTHER_TEAM, cpnId: id })).toMatchObject({ ok: false });
  });

  it("사용한 쿠폰은 되돌린 뒤에만 취소된다", async () => {
    const { fake, db, id } = await issued();
    await redeemCouponCore(db, { teamId: TEAM, usedByMemId: ADMIN, cpnId: id });
    expect(await cancelCouponCore(db, { teamId: TEAM, cpnId: id })).toMatchObject({ ok: false });
    expect(await unredeemCouponCore(db, { teamId: TEAM, cpnId: id })).toEqual({ ok: true });
    expect(fake.tables.cpn_mst[0]).toMatchObject({ used_yn: false, used_dt: null, used_memo_txt: null });
    expect(await cancelCouponCore(db, { teamId: TEAM, cpnId: id })).toEqual({ ok: true });
    expect(fake.tables.cpn_mst[0].del_yn).toBe(true);
  });
});
