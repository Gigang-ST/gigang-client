import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import {
  evalAttendOnBirthday,
  evalGthrAttendInMonth,
  evalGthrAttendStreak,
  evalGthrCancelCount,
  evalGthrCancelReason,
  evalGthrMonthAttendRate,
  evalGthrSameDayCount,
} from "@/lib/titles/evaluators-gathering";
import type { GatheringWindow } from "@/lib/titles/evaluators-gathering";

const KST = "Asia/Seoul";
const TEAM = "team-1";
const ME = "mem-me";

/** KST 시각 문자열 → DB가 돌려주는 timestamptz(UTC ISO) */
const ts = (kstLocal: string) => dayjs.tz(kstLocal, KST).toISOString();

const OPEN: GatheringWindow = { asOfDt: null, effStartDt: null };

/**
 * Supabase 쿼리 빌더 흉내 — `.eq/.in/.not/.order/.maybeSingle`을 체이닝만 하고
 * 마지막에 준비된 데이터를 돌려준다. 평가 함수가 **어떤 행을 받았을 때 어떻게 판정하는지**를
 * 보려는 것이지 PostgREST를 재현하려는 게 아니다.
 */
function fakeDb(tables: Record<string, unknown[]>) {
  const make = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "in", "not", "gte", "lte", "order"]) {
      q[m] = () => q;
    }
    q.select = () => q;
    q.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null });
    // await 시 { data } 로 풀리게
    q.then = (res: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: rows }).then(res);
    return q;
  };
  return { from: (t: string) => make(tables[t] ?? []) } as never;
}

/** 참석 행 하나(모임 시작 시각은 KST 로컬 문자열로 준다) */
const attd = (gthrId: string, kstLocal: string) => ({
  gthr_id: gthrId,
  gthr_mst: { stt_at: ts(kstLocal), team_id: TEAM, del_yn: false },
});

describe("#1 gthr_attend_in_month — 미라클·올빼미", () => {
  it("한 달 안에 3회여야 한다 — 달을 걸치면 미달", () => {
    const db = fakeDb({
      gthr_attd_rel: [
        attd("g1", "2026-08-01T06:00:00"),
        attd("g2", "2026-08-15T06:30:00"),
        attd("g3", "2026-09-02T06:00:00"), // 다음 달
      ],
    });
    return expect(
      evalGthrAttendInMonth(
        { type: "gthr_attend_in_month", count: 3, before_time: "07:00" },
        ME, TEAM, OPEN, db,
      ),
    ).resolves.toBe(false);
  });

  it("같은 달 3회면 통과", async () => {
    const db = fakeDb({
      gthr_attd_rel: [
        attd("g1", "2026-08-01T06:00:00"),
        attd("g2", "2026-08-15T06:30:00"),
        attd("g3", "2026-08-20T05:00:00"),
      ],
    });
    await expect(
      evalGthrAttendInMonth(
        { type: "gthr_attend_in_month", count: 3, before_time: "07:00" },
        ME, TEAM, OPEN, db,
      ),
    ).resolves.toBe(true);
  });

  it("⚠️ 시간대는 KST로 판정한다 — UTC로 세면 새벽이 전날 저녁으로 밀린다", async () => {
    // KST 06:00 = UTC 전날 21:00. UTC 기준이면 before_time 07:00에 안 걸린다.
    const db = fakeDb({ gthr_attd_rel: [attd("g1", "2026-08-01T06:00:00")] });
    await expect(
      evalGthrAttendInMonth(
        { type: "gthr_attend_in_month", count: 1, before_time: "07:00" },
        ME, TEAM, OPEN, db,
      ),
    ).resolves.toBe(true);
  });

  it("after_time은 그 시각 이후만 (올빼미 21:00)", async () => {
    const db = fakeDb({
      gthr_attd_rel: [attd("g1", "2026-08-01T20:00:00"), attd("g2", "2026-08-02T21:30:00")],
    });
    await expect(
      evalGthrAttendInMonth(
        { type: "gthr_attend_in_month", count: 2, after_time: "21:00" },
        ME, TEAM, OPEN, db,
      ),
    ).resolves.toBe(false);
  });

  it("적용 시작일 이전 모임은 안 센다", async () => {
    const db = fakeDb({
      gthr_attd_rel: [attd("g1", "2026-07-31T06:00:00"), attd("g2", "2026-08-01T06:00:00")],
    });
    await expect(
      evalGthrAttendInMonth(
        { type: "gthr_attend_in_month", count: 2, before_time: "07:00" },
        ME, TEAM, { asOfDt: null, effStartDt: "2026-08-01" }, db,
      ),
    ).resolves.toBe(false);
  });

  it("⚠️ asOfDt 이후 모임은 안 센다 — 아직 안 열린 모임을 신청만 해도 붙는 걸 막는다", async () => {
    const db = fakeDb({
      gthr_attd_rel: [
        attd("g1", "2026-08-10T06:00:00"),
        attd("g2", "2026-08-20T06:00:00"), // 미래(유예 밖)
      ],
    });
    await expect(
      evalGthrAttendInMonth(
        { type: "gthr_attend_in_month", count: 2, before_time: "07:00" },
        ME, TEAM, { asOfDt: "2026-08-11", effStartDt: null }, db,
      ),
    ).resolves.toBe(false);
  });
});

describe("#3 gthr_attend_streak — 3연벙", () => {
  const streak = (dates: string[]) =>
    fakeDb({ gthr_attd_rel: dates.map((d, i) => attd(`g${i}`, `${d}T19:00:00`)) });

  it("사흘 연속이면 통과", async () => {
    await expect(
      evalGthrAttendStreak(
        { type: "gthr_attend_streak", days: 3 },
        ME, TEAM, OPEN,
        streak(["2026-08-01", "2026-08-02", "2026-08-03"]),
      ),
    ).resolves.toBe(true);
  });

  it("하루 비면 끊긴다", async () => {
    await expect(
      evalGthrAttendStreak(
        { type: "gthr_attend_streak", days: 3 },
        ME, TEAM, OPEN,
        streak(["2026-08-01", "2026-08-02", "2026-08-04"]),
      ),
    ).resolves.toBe(false);
  });

  it("하루에 두 개 나가도 그날은 1일이다", async () => {
    const db = fakeDb({
      gthr_attd_rel: [
        attd("g1", "2026-08-01T07:00:00"),
        attd("g2", "2026-08-01T20:00:00"), // 같은 날
        attd("g3", "2026-08-02T20:00:00"),
      ],
    });
    await expect(
      evalGthrAttendStreak({ type: "gthr_attend_streak", days: 3 }, ME, TEAM, OPEN, db),
    ).resolves.toBe(false);
  });
});

describe("#2 gthr_cancel_count — 다음엔꼭·회전문·월요병", () => {
  const cancel = (gthrId: string, cancelKst: string, startKst: string, reason: string | null = null) => ({
    gthr_id: gthrId,
    evt_at: ts(cancelKst),
    reason_txt: reason,
    gthr_mst: { stt_at: ts(startKst), team_id: TEAM, del_yn: false },
  });

  it("당일 취소만 센다(취소일 = 모임일, 양쪽 다 KST)", async () => {
    const db = fakeDb({
      gthr_attd_hist: [
        cancel("g1", "2026-08-10T18:00:00", "2026-08-10T20:00:00"), // 당일
        cancel("g2", "2026-08-09T10:00:00", "2026-08-10T20:00:00"), // 전날
      ],
    });
    await expect(
      evalGthrCancelCount({ type: "gthr_cancel_count", count: 2, same_day: true }, ME, TEAM, OPEN, db),
    ).resolves.toBe(false);
  });

  it("요일은 **모임이 열리는 날** 기준이다 — 취소한 날이 아니다", async () => {
    // 8/10(월) 모임을 8/8(토)에 취소 → 월요병으로 센다
    const db = fakeDb({
      gthr_attd_hist: [cancel("g1", "2026-08-08T10:00:00", "2026-08-10T20:00:00")],
    });
    await expect(
      evalGthrCancelCount({ type: "gthr_cancel_count", count: 1, weekday: 1 }, ME, TEAM, OPEN, db),
    ).resolves.toBe(true);
  });

  it("회전문은 **같은 모임**에서 2건이어야 한다(전체 누적 아님)", async () => {
    const db = fakeDb({
      gthr_attd_hist: [
        cancel("g1", "2026-08-01T10:00:00", "2026-08-02T20:00:00"),
        cancel("g2", "2026-08-03T10:00:00", "2026-08-04T20:00:00"),
      ],
    });
    await expect(
      evalGthrCancelCount(
        { type: "gthr_cancel_count", count: 2, same_gathering: true },
        ME, TEAM, OPEN, db,
      ),
    ).resolves.toBe(false);
  });
});

describe("#10 gthr_cancel_reason — 칼퇴실패·구구절절", () => {
  const cancel = (reason: string | null) => ({
    gthr_id: "g1",
    evt_at: ts("2026-08-10T18:00:00"),
    reason_txt: reason,
    gthr_mst: { stt_at: ts("2026-08-10T20:00:00"), team_id: TEAM, del_yn: false },
  });

  it("키워드가 든 사유만 센다", async () => {
    const db = fakeDb({
      gthr_attd_hist: [cancel("야근이슈로 불참입니다.."), cancel("비 눈치보다가 결국 취소합니다")],
    });
    await expect(
      evalGthrCancelReason(
        { type: "gthr_cancel_reason", count: 2, keyword: "야근" },
        ME, TEAM, OPEN, db,
      ),
    ).resolves.toBe(false);
  });

  it("길이 조건 — 40자 이상", async () => {
    const long = "가".repeat(40);
    const db = fakeDb({ gthr_attd_hist: [cancel(long), cancel("짧음")] });
    await expect(
      evalGthrCancelReason(
        { type: "gthr_cancel_reason", count: 1, min_length: 40 },
        ME, TEAM, OPEN, db,
      ),
    ).resolves.toBe(true);
  });

  it("사유가 비었으면 안 센다", async () => {
    const db = fakeDb({ gthr_attd_hist: [cancel(null), cancel("   ")] });
    await expect(
      evalGthrCancelReason({ type: "gthr_cancel_reason", count: 1, min_length: 1 }, ME, TEAM, OPEN, db),
    ).resolves.toBe(false);
  });
});

describe("#4 gthr_month_attend_rate — 프로참석러", () => {
  it("그 달 70% 이상이면 통과", async () => {
    const held = ["2026-08-01", "2026-08-05", "2026-08-10", "2026-08-15"].map((d) => ({
      stt_at: ts(`${d}T20:00:00`),
    }));
    const db = fakeDb({
      gthr_attd_rel: [
        attd("g1", "2026-08-01T20:00:00"),
        attd("g2", "2026-08-05T20:00:00"),
        attd("g3", "2026-08-10T20:00:00"),
      ],
      gthr_mst: held,
    });
    await expect(
      evalGthrMonthAttendRate(
        { type: "gthr_month_attend_rate", min_rate: 0.7, min_gatherings: 3 },
        ME, TEAM, OPEN, db,
      ),
    ).resolves.toBe(true); // 3/4 = 75%
  });

  it("모임이 적은 달(min_gatherings 미만)은 판정 제외", async () => {
    const db = fakeDb({
      gthr_attd_rel: [attd("g1", "2026-08-01T20:00:00")],
      gthr_mst: [{ stt_at: ts("2026-08-01T20:00:00") }],
    });
    await expect(
      evalGthrMonthAttendRate(
        { type: "gthr_month_attend_rate", min_rate: 0.7, min_gatherings: 3 },
        ME, TEAM, OPEN, db,
      ),
    ).resolves.toBe(false); // 1/1 = 100%지만 모임이 1개뿐
  });
});

describe("#5 gthr_same_day_count — 하루에두번", () => {
  it("하루에 두 개 나간 날이 있으면 통과", async () => {
    const db = fakeDb({
      gthr_attd_rel: [attd("g1", "2026-08-01T07:00:00"), attd("g2", "2026-08-01T20:00:00")],
    });
    await expect(
      evalGthrSameDayCount({ type: "gthr_same_day_count", per_day: 2, count: 1 }, ME, TEAM, OPEN, db),
    ).resolves.toBe(true);
  });

  it("서로 다른 날이면 안 된다", async () => {
    const db = fakeDb({
      gthr_attd_rel: [attd("g1", "2026-08-01T07:00:00"), attd("g2", "2026-08-02T20:00:00")],
    });
    await expect(
      evalGthrSameDayCount({ type: "gthr_same_day_count", per_day: 2, count: 1 }, ME, TEAM, OPEN, db),
    ).resolves.toBe(false);
  });
});

describe("#22 attend_on_birthday — 생일축하해", () => {
  it("생일에 모임을 나갔으면 통과", async () => {
    const db = fakeDb({
      mem_mst: [{ birth_dt: "1995-08-10" }],
      gthr_attd_rel: [attd("g1", "2026-08-10T20:00:00")],
      rec_race_hist: [],
    });
    await expect(
      evalAttendOnBirthday({ type: "attend_on_birthday", count: 1 }, ME, TEAM, OPEN, db),
    ).resolves.toBe(true);
  });

  it("생일에 대회를 뛰었어도 통과(같이 나간 것)", async () => {
    const db = fakeDb({
      mem_mst: [{ birth_dt: "1995-08-10" }],
      gthr_attd_rel: [],
      rec_race_hist: [{ race_dt: "2026-08-10" }],
    });
    await expect(
      evalAttendOnBirthday({ type: "attend_on_birthday", count: 1 }, ME, TEAM, OPEN, db),
    ).resolves.toBe(true);
  });

  it("생일이 아닌 날은 안 된다", async () => {
    const db = fakeDb({
      mem_mst: [{ birth_dt: "1995-08-10" }],
      gthr_attd_rel: [attd("g1", "2026-08-11T20:00:00")],
      rec_race_hist: [{ race_dt: "2026-08-09" }],
    });
    await expect(
      evalAttendOnBirthday({ type: "attend_on_birthday", count: 1 }, ME, TEAM, OPEN, db),
    ).resolves.toBe(false);
  });

  it("생일 미입력이면 영원히 판정 불가(false)", async () => {
    const db = fakeDb({
      mem_mst: [{ birth_dt: null }],
      gthr_attd_rel: [attd("g1", "2026-08-10T20:00:00")],
    });
    await expect(
      evalAttendOnBirthday({ type: "attend_on_birthday", count: 1 }, ME, TEAM, OPEN, db),
    ).resolves.toBe(false);
  });

  it("⚠️ 윤년은 고려하지 않는다 — 2/29 생일은 평년에 안 열린다", async () => {
    const db = fakeDb({
      mem_mst: [{ birth_dt: "1996-02-29" }],
      gthr_attd_rel: [attd("g1", "2026-02-28T20:00:00")],
      rec_race_hist: [],
    });
    await expect(
      evalAttendOnBirthday({ type: "attend_on_birthday", count: 1 }, ME, TEAM, OPEN, db),
    ).resolves.toBe(false);
  });
});
