import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 뉴비 넛지 크론 — (팀, 사람) 단위 판정 회귀 테스트(멀티팀).
 *
 * 예전엔 사람 단위(mem_onbd_prf)라, 두 팀에 가입한 사람이 한 팀 모임에 나오면 다른 팀 넛지까지
 * 빠지거나, 한 팀에서 한 약속으로 다른 팀 이름의 알림이 나갈 수 있었다.
 */

const GIGANG = "c0ffee00-0000-4000-8000-000000000001";
const ULSAN = "c0ffee00-0000-4000-8000-000000000002";
const BOTH = "aaaaaaaa-0000-4000-8000-000000000001"; // 두 팀 소속
const ONLY_G = "aaaaaaaa-0000-4000-8000-000000000002"; // 기강만, 기강 모임 참석함

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  sent: [] as { teamId: string; memId: string; notiTypeEnm: string }[],
}));

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }));
vi.mock("@/lib/notifications/insert-noti", () => ({
  insertNoti: vi.fn(async (a: { teamId: string; memId: string; notiTypeEnm: string }) => {
    h.sent.push({ teamId: a.teamId, memId: a.memId, notiTypeEnm: a.notiTypeEnm });
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createUntypedAdminClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "not", "in", "eq", "gt", "order", "limit"]) builder[m] = () => builder;
      builder.maybeSingle = async () => ({ data: null, error: null });
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: h.tables[table] ?? [], error: null });
      return builder;
    },
  }),
}));

import { dayjs } from "@/lib/dayjs";

import { GET } from "@/app/api/cron/newbie-nudge/route";

const req = () => new Request("http://x/api/cron/newbie-nudge", { headers: { authorization: "Bearer s3cret" } });

beforeEach(() => {
  h.sent = [];
  const pledgedAt = dayjs().subtract(20, "day").toISOString(); // D+14 창 안
  h.tables = {
    team_mem_onbd_rel: [
      { team_id: GIGANG, mem_id: BOTH, attd_pldg_at: pledgedAt },
      { team_id: ULSAN, mem_id: BOTH, attd_pldg_at: pledgedAt },
      { team_id: GIGANG, mem_id: ONLY_G, attd_pldg_at: pledgedAt },
    ],
    mem_mst: [{ mem_id: BOTH }, { mem_id: ONLY_G }],
    team_mem_rel: [
      { mem_id: BOTH, team_id: GIGANG },
      { mem_id: BOTH, team_id: ULSAN },
      { mem_id: ONLY_G, team_id: GIGANG },
    ],
    // BOTH 는 기강 모임에만 나왔다. ONLY_G 도 기강 모임에 나왔다.
    gthr_attd_rel: [
      { mem_id: BOTH, gthr_mst: { team_id: GIGANG } },
      { mem_id: ONLY_G, gthr_mst: { team_id: GIGANG } },
    ],
    noti_mst: [],
  };
});

describe("newbie-nudge — 팀별 판정", () => {
  it("한 팀 모임에 나와도 다른 팀(안 나온 팀) 넛지는 그 팀 이름으로 나간다", async () => {
    const res = await GET(req());
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, sent14: 1, sent28: 0 });
    expect(h.sent).toEqual([{ teamId: ULSAN, memId: BOTH, notiTypeEnm: "newbie_nudge_14" }]);
  });

  it("다른 팀에서 받은 넛지 이력은 이 팀 넛지를 막지 않는다", async () => {
    h.tables.noti_mst = [{ team_id: GIGANG, mem_id: BOTH }];
    await GET(req());
    expect(h.sent).toEqual([{ teamId: ULSAN, memId: BOTH, notiTypeEnm: "newbie_nudge_14" }]);
  });

  it("이 팀에서 이미 받았으면 다시 안 보낸다", async () => {
    h.tables.noti_mst = [{ team_id: ULSAN, mem_id: BOTH }];
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ sent14: 0 });
    expect(h.sent).toEqual([]);
  });

  it("그 팀에서 active 가 아니면 대상이 아니다", async () => {
    h.tables.team_mem_rel = [{ mem_id: BOTH, team_id: GIGANG }];
    await GET(req());
    expect(h.sent).toEqual([]);
  });
});
