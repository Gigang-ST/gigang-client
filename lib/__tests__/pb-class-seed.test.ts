/**
 * PB 기본 훈련표 자동 채우기 — "활성화하면 알아서 들어가게"(오너 지시 2026-10-07).
 * 비어 있을 때만 · 13회차일 때만 · 이미 있으면 덮지 않는다를 못박는다.
 */
import { describe, expect, it } from "vitest";

import { PB_DEFAULT_SESS_PLANS } from "@/lib/pb-class-plan";
import { ensureDefaultSessPlans } from "@/lib/pb-class-seed";

type Res = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };
type Handlers = {
  evt?: Res;
  cfg?: Res;
  planCount?: Res;
  insert?: Res;
};

/** 테이블·동작별로 정해 둔 응답을 돌려주는 최소 가짜 클라이언트 */
function fakeDb(h: Handlers) {
  const inserted: unknown[] = [];
  const db = {
    from(table: string) {
      const resolve = (): Res => {
        if (table === "evt_team_mst") return h.evt ?? { data: null, error: null };
        if (table === "evt_pb_cfg") return h.cfg ?? { data: null, error: null };
        if (table === "evt_pb_sess_plan") return h.planCount ?? { count: 0, error: null };
        return { data: null, error: null };
      };
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve(resolve()),
        insert: (rows: unknown[]) => {
          inserted.push(...rows);
          return Promise.resolve(h.insert ?? { error: null });
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(resolve()).then(res, rej),
      };
      return q;
    },
  };
  return { db: db as unknown as Parameters<typeof ensureDefaultSessPlans>[0], inserted };
}

const PB = { data: { evt_type_cd: "PB_CLASS" }, error: null };

describe("ensureDefaultSessPlans", () => {
  it("비어 있으면 기본 훈련표 13회차를 넣는다", async () => {
    const { db, inserted } = fakeDb({ evt: PB });
    await expect(ensureDefaultSessPlans(db, "e1")).resolves.toBe("seeded");
    expect(inserted).toHaveLength(PB_DEFAULT_SESS_PLANS.length);
    expect(inserted[0]).toMatchObject({ evt_id: "e1", sess_no: 1, ttl: PB_DEFAULT_SESS_PLANS[0].ttl });
  });

  it("이미 한 줄이라도 있으면 덮지 않는다(운영진이 고친 내용 보존)", async () => {
    const { db, inserted } = fakeDb({ evt: PB, planCount: { count: 3, error: null } });
    await expect(ensureDefaultSessPlans(db, "e1")).resolves.toBe("exists");
    expect(inserted).toHaveLength(0);
  });

  it("총 회차가 13이 아니면 넣지 않는다(측정 회차가 어긋난다)", async () => {
    const cfg = {
      data: {
        tot_sess_cnt: 10,
        full_rfnd_attd_cnt: 7,
        late_join_wk_no: 6,
        deposit_amt: 30000,
        entry_fee_amt: 10000,
        mlg_dc_amt: 5000,
        rule_json: {},
      },
      error: null,
    };
    const { db, inserted } = fakeDb({ evt: PB, cfg });
    await expect(ensureDefaultSessPlans(db, "e1")).resolves.toBe("cfg_mismatch");
    expect(inserted).toHaveLength(0);
  });

  it("마일리지런이면 아무것도 안 한다", async () => {
    const { db, inserted } = fakeDb({ evt: { data: { evt_type_cd: "MILEAGE_RUN" }, error: null } });
    await expect(ensureDefaultSessPlans(db, "e1")).resolves.toBe("not_pb");
    expect(inserted).toHaveLength(0);
  });

  it("동시에 두 경로가 채워 PK가 겹치면 '이미 있음'으로 본다", async () => {
    const { db } = fakeDb({ evt: PB, insert: { error: { message: "dup", code: "23505" } } });
    await expect(ensureDefaultSessPlans(db, "e1")).resolves.toBe("exists");
  });

  it("그 밖의 실패는 던진다(호출부가 로그로 남긴다)", async () => {
    const { db } = fakeDb({ evt: PB, insert: { error: { message: "boom" } } });
    await expect(ensureDefaultSessPlans(db, "e1")).rejects.toThrow("boom");
  });
});

describe("기본 훈련표 표기", () => {
  it("코치 약어(크루즈·P±초·N × 거리)를 쓰지 않고, 반복 훈련엔 쉬는 방법이 적혀 있다", () => {
    for (const p of PB_DEFAULT_SESS_PLANS) {
      const txt = `${p.ttl} ${p.mainTxt} ${p.easyTxt ?? ""} ${p.purpTxt}`;
      expect(txt).not.toMatch(/크루즈|최대산소섭취량|P[+-]\d|\d+\s*×\s*\d/);
      if (p.mainTxt.includes("회")) expect(p.mainTxt).toMatch(/조깅|걷/);
    }
    expect(PB_DEFAULT_SESS_PLANS[6].purpTxt).toContain("VO2max");
  });
});
