import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import {
  evalCmntMentionCount,
  evalCmntMonthlyTop,
  evalCmntReplyCount,
  evalPostBackfillDays,
  evalPostCount,
  evalPostDaysInMonth,
  evalRacePairReversal,
  evalRaceTimeExactHour,
} from "@/lib/titles/evaluators-social";
import type { SocialWindow } from "@/lib/titles/evaluators-social";

const KST = "Asia/Seoul";
const TEAM = "team-1";
const ME = "mem-me";
const OPEN: SocialWindow = { effStartDt: null };

const ts = (kstLocal: string) => dayjs.tz(kstLocal, KST).toISOString();

/** 테이블별로 준비된 행을 돌려주는 가짜 쿼리 빌더. */
function fakeDb(tables: Record<string, unknown[]>) {
  const make = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "in", "not", "gt", "gte", "lte", "lt", "order"]) q[m] = () => q;
    q.select = () => q;
    q.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null });
    q.then = (res: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: rows }).then(res);
    return q;
  };
  return { from: (t: string) => make(tables[t] ?? []) } as never;
}

const post = (postId: string, actDt: string | null, crtAtKst: string) => ({
  post_id: postId, act_dt: actDt, crt_at: ts(crtAtKst),
});

describe("#11 post_count — 오운완·깅플루언서", () => {
  it("사진 글 3장이면 통과", async () => {
    const db = fakeDb({
      post_mst: [
        post("p1", "2026-08-14", "2026-08-14T10:00:00"),
        post("p2", "2026-08-15", "2026-08-15T10:00:00"),
        post("p3", "2026-08-16", "2026-08-16T10:00:00"),
      ],
    });
    await expect(evalPostCount({ type: "post_count", count: 3 }, ME, OPEN, db)).resolves.toBe(true);
  });

  it("⚠️ 활동일이 적용일 이전이면 안 센다 — 과거로 적으면 오히려 제외된다", async () => {
    // act_dt를 과거로 적어 적용일을 우회하려 해도 반대로 작동한다(§7.5).
    const db = fakeDb({
      post_mst: [
        post("p1", "2026-07-20", "2026-08-15T10:00:00"),
        post("p2", "2026-08-15", "2026-08-15T10:00:00"),
      ],
    });
    await expect(
      evalPostCount({ type: "post_count", count: 2 }, ME, { effStartDt: "2026-08-14" }, db),
    ).resolves.toBe(false);
  });
});

describe("#12 post_days_in_month — 연재작가", () => {
  it("같은 달에 서로 다른 날짜 5일이면 통과", async () => {
    const days = ["01", "05", "10", "15", "20"];
    const db = fakeDb({
      post_mst: days.map((d) => post(`p${d}`, `2026-08-${d}`, `2026-08-${d}T10:00:00`)),
    });
    await expect(
      evalPostDaysInMonth({ type: "post_days_in_month", days: 5 }, ME, OPEN, db),
    ).resolves.toBe(true);
  });

  it("같은 날 여러 장은 하루로 센다", async () => {
    const db = fakeDb({
      post_mst: [
        post("p1", "2026-08-01", "2026-08-01T10:00:00"),
        post("p2", "2026-08-01", "2026-08-01T11:00:00"),
        post("p3", "2026-08-01", "2026-08-01T12:00:00"),
      ],
    });
    await expect(
      evalPostDaysInMonth({ type: "post_days_in_month", days: 2 }, ME, OPEN, db),
    ).resolves.toBe(false);
  });

  it("달을 걸치면 미달", async () => {
    const db = fakeDb({
      post_mst: [
        post("p1", "2026-08-31", "2026-08-31T10:00:00"),
        post("p2", "2026-09-01", "2026-09-01T10:00:00"),
      ],
    });
    await expect(
      evalPostDaysInMonth({ type: "post_days_in_month", days: 2 }, ME, OPEN, db),
    ).resolves.toBe(false);
  });
});

describe("#13 post_backfill_days — 유물발굴", () => {
  it("활동일보다 14일 늦게 올렸으면 통과", async () => {
    const db = fakeDb({ post_mst: [post("p1", "2026-08-01", "2026-08-15T10:00:00")] });
    await expect(
      evalPostBackfillDays({ type: "post_backfill_days", days: 14, count: 1 }, ME, OPEN, db),
    ).resolves.toBe(true);
  });

  it("13일이면 미달 — 날짜끼리 빼는 것이지 경과 시각이 아니다", async () => {
    const db = fakeDb({ post_mst: [post("p1", "2026-08-01", "2026-08-14T23:59:00")] });
    await expect(
      evalPostBackfillDays({ type: "post_backfill_days", days: 14, count: 1 }, ME, OPEN, db),
    ).resolves.toBe(false);
  });
});

describe("#15 cmnt_reply_count — 말대꾸", () => {
  const cmnt = (id: string, prnt: string | null) => ({
    cmnt_id: id, entity_type: "post", entity_id: "p1", prnt_id: prnt,
    crt_at: ts("2026-08-15T10:00:00"),
  });

  it("대댓글만 센다(최상위 댓글은 제외)", async () => {
    const db = fakeDb({
      cmnt_mst: [cmnt("c1", null), cmnt("c2", "c1"), cmnt("c3", "c1")],
    });
    await expect(
      evalCmntReplyCount({ type: "cmnt_reply_count", count: 3 }, ME, OPEN, db),
    ).resolves.toBe(false);
    await expect(
      evalCmntReplyCount({ type: "cmnt_reply_count", count: 2 }, ME, OPEN, db),
    ).resolves.toBe(true);
  });
});

describe("#16 cmnt_mention_count — 소환술사", () => {
  const cmnt = (id: string) => ({
    cmnt_id: id, entity_type: "post", entity_id: "p1", prnt_id: null,
    crt_at: ts("2026-08-15T10:00:00"),
  });

  it("⚠️ 자기 자신 멘션은 빼고, 같은 사람 반복은 센다", async () => {
    const db = fakeDb({
      cmnt_mst: [cmnt("c1"), cmnt("c2"), cmnt("c3")],
      cmnt_mention_rel: [
        { cmnt_id: "c1", mem_id: "friend" },
        { cmnt_id: "c2", mem_id: "friend" }, // 같은 사람 반복 → 센다
        { cmnt_id: "c3", mem_id: ME },       // 자기 자신 → 뺀다
      ],
    });
    await expect(
      evalCmntMentionCount({ type: "cmnt_mention_count", count: 2 }, ME, OPEN, db),
    ).resolves.toBe(true);
    await expect(
      evalCmntMentionCount({ type: "cmnt_mention_count", count: 3 }, ME, OPEN, db),
    ).resolves.toBe(false);
  });
});

describe("#17 cmnt_monthly_top — 투머치토커", () => {
  const rows = (counts: Record<string, number>) =>
    Object.entries(counts).flatMap(([memId, n]) =>
      Array.from({ length: n }, () => ({ mem_id: memId, crt_at: ts("2026-07-10T10:00:00") })),
    );

  it("그 달 1위면 통과", async () => {
    const db = fakeDb({ cmnt_mst: rows({ [ME]: 16, other: 5 }) });
    await expect(
      evalCmntMonthlyTop({ type: "cmnt_monthly_top", min_count: 10 }, ME, TEAM, "2026-07", OPEN, db),
    ).resolves.toBe(true);
  });

  it("⚠️ 최소 문턱 미달이면 1위여도 안 준다 — 조용한 달에 2개 쓰고 Too Much Talker", async () => {
    const db = fakeDb({ cmnt_mst: rows({ [ME]: 2, other: 1 }) });
    await expect(
      evalCmntMonthlyTop({ type: "cmnt_monthly_top", min_count: 10 }, ME, TEAM, "2026-07", OPEN, db),
    ).resolves.toBe(false);
  });

  it("⚠️ 동률 1위면 아무에게도 안 준다", async () => {
    const db = fakeDb({ cmnt_mst: rows({ [ME]: 12, other: 12 }) });
    await expect(
      evalCmntMonthlyTop({ type: "cmnt_monthly_top", min_count: 10 }, ME, TEAM, "2026-07", OPEN, db),
    ).resolves.toBe(false);
  });

  it("1위가 아니면 안 준다(차순위로 안 내려간다)", async () => {
    const db = fakeDb({ cmnt_mst: rows({ [ME]: 11, other: 20 }) });
    await expect(
      evalCmntMonthlyTop({ type: "cmnt_monthly_top", min_count: 10 }, ME, TEAM, "2026-07", OPEN, db),
    ).resolves.toBe(false);
  });

  it("적용일보다 이전 달은 판정 대상이 아니다", async () => {
    const db = fakeDb({ cmnt_mst: rows({ [ME]: 30 }) });
    await expect(
      evalCmntMonthlyTop(
        { type: "cmnt_monthly_top", min_count: 10 }, ME, TEAM, "2026-07",
        { effStartDt: "2026-08-01" }, db,
      ),
    ).resolves.toBe(false);
  });
});

describe("팀 공통 조회는 멤버 수만큼 반복되지 않는다", () => {
  function countingDb(rows: unknown[]) {
    let calls = 0;
    const make = () => {
      const q: Record<string, unknown> = {};
      for (const m of ["eq", "in", "not", "gt", "gte", "lte", "lt", "order"]) q[m] = () => q;
      q.select = () => q;
      q.then = (res: (v: { data: unknown[] }) => unknown) => {
        calls += 1;
        return Promise.resolve({ data: rows }).then(res);
      };
      return q;
    };
    return { db: { from: () => make() } as never, calls: () => calls };
  }

  it("⚠️ 투머치토커의 팀 댓글 집계는 캐시를 공유하면 1번이다", async () => {
    // 1위가 누구인지는 멤버와 무관하다. 예전엔 멤버마다 팀 전체 댓글을 다시 읽어
    // 200번이 나갔고, 그게 월 배치 20초의 주범이었다.
    const rows = Array.from({ length: 12 }, () => ({
      mem_id: "top", crt_at: ts("2026-07-10T10:00:00"),
    }));
    const { db, calls } = countingDb(rows);
    const win: SocialWindow = { effStartDt: null, cache: new Map() };
    const rule = { type: "cmnt_monthly_top", min_count: 10 } as const;

    // 멤버 셋을 연달아 평가 — 배치가 캐시를 공유하는 상황
    await evalCmntMonthlyTop(rule, "m1", TEAM, "2026-07", win, db);
    await evalCmntMonthlyTop(rule, "m2", TEAM, "2026-07", win, db);
    await evalCmntMonthlyTop(rule, "m3", TEAM, "2026-07", win, db);

    expect(calls()).toBe(1);
  });

  it("기준 월이 다르면 캐시를 공유하지 않는다", async () => {
    const { db, calls } = countingDb([]);
    const win: SocialWindow = { effStartDt: null, cache: new Map() };
    const rule = { type: "cmnt_monthly_top", min_count: 10 } as const;

    await evalCmntMonthlyTop(rule, "m1", TEAM, "2026-07", win, db);
    await evalCmntMonthlyTop(rule, "m1", TEAM, "2026-06", win, db);

    expect(calls()).toBe(2);
  });
});

describe("#19 race_time_exact_hour — 완벽한기록", () => {
  it("정확히 3시간이면 통과", async () => {
    const db = fakeDb({ rec_race_hist: [{ rec_time_sec: 10800, race_dt: "2026-08-15" }] });
    await expect(
      evalRaceTimeExactHour({ type: "race_time_exact_hour", count: 1 }, ME, OPEN, db),
    ).resolves.toBe(true);
  });

  it("⚠️ 0초는 통과시키지 않는다 — 0 % 3600 = 0이라 가드가 없으면 전원에게 붙는다", async () => {
    const db = fakeDb({ rec_race_hist: [{ rec_time_sec: 0, race_dt: "2026-08-15" }] });
    await expect(
      evalRaceTimeExactHour({ type: "race_time_exact_hour", count: 1 }, ME, OPEN, db),
    ).resolves.toBe(false);
  });

  it("1초라도 어긋나면 미달", async () => {
    const db = fakeDb({ rec_race_hist: [{ rec_time_sec: 10801, race_dt: "2026-08-15" }] });
    await expect(
      evalRaceTimeExactHour({ type: "race_time_exact_hour", count: 1 }, ME, OPEN, db),
    ).resolves.toBe(false);
  });
});

describe("#21 race_pair_reversal — 하수야~ / 고수님..", () => {
  /** 내 기록 + 상대 기록을 같은 대회·종목으로 맞물려 만든다. */
  const duel = (rows: { evt: string; type: string; dt: string; mine: number; theirs: number }[]) =>
    fakeDb({
      rec_race_hist: rows.map((r) => ({
        comp_evt_id: r.evt, comp_evt_type: r.type, race_dt: r.dt, rec_time_sec: r.mine,
        mem_id: ME,
      })),
    });

  it("맞대결이 1회뿐이면 역전이 성립하지 않는다", async () => {
    const db = duel([{ evt: "e1", type: "FULL", dt: "2026-08-15", mine: 10000, theirs: 11000 }]);
    await expect(
      evalRacePairReversal({ type: "race_pair_reversal", direction: "winner" }, ME, TEAM, OPEN, db),
    ).resolves.toBe(false);
  });

  it("기록이 없으면 false", async () => {
    await expect(
      evalRacePairReversal(
        { type: "race_pair_reversal", direction: "winner" }, ME, TEAM, OPEN, fakeDb({}),
      ),
    ).resolves.toBe(false);
  });
});
