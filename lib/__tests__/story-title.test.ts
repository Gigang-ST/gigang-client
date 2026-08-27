import { describe, expect, it } from "vitest";

import {
  buildTitleLeadPool,
  countTitleMoreMembers,
  pickTitleLead,
  pickTitleLedeStart,
  summarizeRecentTitleGrants,
} from "@/lib/story-title";

import type { RecentTitleRow } from "@/lib/story-title";

/**
 * 테스트용 칭호 row — grants는 [mem_id, grnt_at] 튜플로 짧게 적는다.
 *
 * `total_mem_cnt`는 창 전체 고유 획득자 수(모든 row에 같은 값)라 이 헬퍼가 알 수 없다 —
 * 기본은 이 row의 인원으로 두고, 잘림(10건 상한)을 재현하는 테스트만 명시로 넘긴다.
 */
function row(
  ttl_id: string,
  grants: [string, string][],
  grant_cnt = grants.length,
  total_mem_cnt = grants.length,
): RecentTitleRow {
  return {
    ttl_id,
    ttl_nm: ttl_id,
    ttl_desc: null,
    desc_visibility: "others",
    last_grnt_at: grants[0]?.[1] ?? "2026-08-01T00:00:00+00:00",
    grant_cnt,
    total_mem_cnt,
    grants: grants.map(([mem_id, grnt_at]) => ({
      mem_id,
      mem_nm: mem_id,
      avatar_url: null,
      grnt_at,
    })),
  };
}

describe("buildTitleLeadPool", () => {
  it("칭호별 묶음을 평탄화해 사람 단위 최신순으로 세운다", () => {
    const pool = buildTitleLeadPool([
      row("A", [
        ["kim", "2026-08-10T00:00:00+00:00"],
        ["lee", "2026-08-08T00:00:00+00:00"],
      ]),
      row("B", [["park", "2026-08-09T00:00:00+00:00"]]),
    ]);
    expect(pool.map((e) => e.person.mem_id)).toEqual(["kim", "park", "lee"]);
  });

  it("같은 사람이 여러 칭호를 따면 최신 수여 1건만 남는다 — 칭호도 그 수여의 것", () => {
    const pool = buildTitleLeadPool([
      row("OLD", [["kim", "2026-08-05T00:00:00+00:00"]]),
      row("NEW", [["kim", "2026-08-10T00:00:00+00:00"]]),
    ]);
    expect(pool).toHaveLength(1);
    expect(pool[0].person.grnt_at).toBe("2026-08-10T00:00:00+00:00");
    expect(pool[0].title.ttl_id).toBe("NEW");
  });

  it("sweep(동시각 수여)에서도 사람 수만큼 나온다 — 유실 없음", () => {
    const t = "2026-08-12T04:18:47+00:00";
    const pool = buildTitleLeadPool([
      row("A", [["m1", t], ["m2", t], ["m3", t]]),
      row("B", [["m2", t], ["m4", t]]),
    ]);
    expect(pool.map((e) => e.person.mem_id).sort()).toEqual([
      "m1", "m2", "m3", "m4",
    ]);
  });

  it("빈 입력이면 빈 pool", () => {
    expect(buildTitleLeadPool([])).toEqual([]);
  });
});

describe("pickTitleLead", () => {
  const pool = buildTitleLeadPool([
    row("A", [
      ["m1", "2026-08-10T00:00:00+00:00"],
      ["m2", "2026-08-09T00:00:00+00:00"],
      ["m3", "2026-08-08T00:00:00+00:00"],
    ]),
  ]);

  it("pick 0이면 최신 획득자가 대표", () => {
    expect(pickTitleLead(pool, 0)?.lead.person.mem_id).toBe("m1");
  });

  it("끝을 넘으면 처음으로 감기고, 음수도 안전하다", () => {
    expect(pickTitleLead(pool, 3)?.lead.person.mem_id).toBe("m1");
    expect(pickTitleLead(pool, 4)?.lead.person.mem_id).toBe("m2");
    expect(pickTitleLead(pool, -1)?.lead.person.mem_id).toBe("m3");
  });

  it("others는 대표와 같은 칭호를 딴 사람만, 대표 본인만 뺀다", () => {
    const picked = pickTitleLead(pool, 1);
    expect(picked?.lead.person.mem_id).toBe("m2");
    expect(picked?.others.map((p) => p.mem_id)).toEqual(["m1", "m3"]);
  });

  it("다른 칭호를 딴 사람은 others에 섞이지 않는다", () => {
    const mixedPool = buildTitleLeadPool([
      row("A", [
        ["m1", "2026-08-10T00:00:00+00:00"],
        ["m2", "2026-08-09T00:00:00+00:00"],
      ]),
      row("B", [["m3", "2026-08-08T00:00:00+00:00"]]),
    ]);
    // 정렬: m1(A,10) → m2(A,9) → m3(B,8)
    const picked = pickTitleLead(mixedPool, 0);
    expect(picked?.lead.person.mem_id).toBe("m1");
    // m3은 다른 칭호(B)라 대표(m1, 칭호 A)의 others엔 안 들어간다.
    expect(picked?.others.map((p) => p.mem_id)).toEqual(["m2"]);
  });

  it("+1 전진이 전원을 커버한다 — 굶는 사람이 구조적으로 없다", () => {
    const seen = new Set<string>();
    for (let cycle = 0; cycle < pool.length; cycle++) {
      seen.add(pickTitleLead(pool, cycle)!.lead.person.mem_id);
    }
    expect([...seen].sort()).toEqual(["m1", "m2", "m3"]);
  });

  it("빈 pool이면 null", () => {
    expect(pickTitleLead([], 0)).toBeNull();
  });
});

describe("countTitleMoreMembers", () => {
  it("그 칭호의 grant_cnt에서 지면에 선 인원(대표 포함)을 뺀다", () => {
    const title = row("A", [["m1", "2026-08-10T00:00:00+00:00"]], 12);
    expect(countTitleMoreMembers(title, 1 + 8)).toBe(3);
  });

  it("grants가 10건에서 잘려도 grant_cnt 기준이라 정확하다 — 실린 이름 수로 세면 어긋난다", () => {
    // prd 실측 형태: 이 칭호를 딴 50명인데 10건 상한 탓에 명단엔 10명만 실려 온다.
    const grants: [string, string][] = Array.from({ length: 10 }, (_, i) => [
      `m${i}`,
      "2026-08-12T04:18:47+00:00",
    ]);
    const title = row("SWEEP", grants, 50);
    const pool = buildTitleLeadPool([title]);
    expect(pool).toHaveLength(10); // 지면이 아는 사람은 10명뿐이지만
    expect(countTitleMoreMembers(title, 1 + 8)).toBe(41); // 세는 건 50명 기준
  });

  it("노출 인원이 grant_cnt 이상이면 0 — 음수를 지면에 올리지 않는다", () => {
    const title = row("A", [["m1", "2026-08-10T00:00:00+00:00"]], 3);
    expect(countTitleMoreMembers(title, 9)).toBe(0);
  });
});

describe("summarizeRecentTitleGrants", () => {
  it("칭호별로 이름을 그대로 묶는다 — 사람 단위로 다시 풀지 않는다", () => {
    const rows = [
      row(
        "A",
        [
          ["kim", "2026-08-10T00:00:00+00:00"],
          ["lee", "2026-08-08T00:00:00+00:00"],
        ],
        2,
      ),
      row("B", [["park", "2026-08-09T00:00:00+00:00"]], 1),
    ];
    expect(summarizeRecentTitleGrants(rows, null)).toEqual([
      {
        ttl_id: "A",
        ttl_nm: "A",
        ttl_desc: null,
        desc_visibility: "others",
        isHeld: false,
        names: ["kim", "lee"],
        moreCount: 0,
      },
      {
        ttl_id: "B",
        ttl_nm: "B",
        ttl_desc: null,
        desc_visibility: "others",
        isHeld: false,
        names: ["park"],
        moreCount: 0,
      },
    ]);
  });

  it("grant_cnt가 실린 이름 수보다 크면 moreCount로 남긴다", () => {
    const rows = [row("SWEEP", [["m1", "2026-08-12T00:00:00+00:00"]], 5)];
    expect(summarizeRecentTitleGrants(rows, null)[0].moreCount).toBe(4);
  });

  it("뷰어 본인이 그 칭호를 받은 창에 있으면 isHeld — 배지 툴팁의 held 게이트용", () => {
    const rows = [
      row("A", [
        ["kim", "2026-08-10T00:00:00+00:00"],
        ["me", "2026-08-09T00:00:00+00:00"],
      ]),
      row("B", [["lee", "2026-08-08T00:00:00+00:00"]]),
    ];
    const summary = summarizeRecentTitleGrants(rows, "me");
    expect(summary.find((g) => g.ttl_id === "A")?.isHeld).toBe(true);
    expect(summary.find((g) => g.ttl_id === "B")?.isHeld).toBe(false);
  });
});

describe("pickTitleLedeStart", () => {
  it("0·1개면 항상 0", () => {
    expect(pickTitleLedeStart(0)).toBe(0);
    expect(pickTitleLedeStart(1)).toBe(0);
  });

  it("범위는 항상 [0, count)", () => {
    for (let i = 0; i < 50; i++) {
      const v = pickTitleLedeStart(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
});
