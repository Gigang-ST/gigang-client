import { describe, expect, it } from "vitest";

import {
  STALE_RUNNING_MINUTES,
  buildAutoParams,
  currentCycleStart,
  hasLiveRun,
  hasSucceededThisCycle,
  resolveDefaultParam,
  staleRunningIds,
} from "@/lib/batch/schedule";
import { dayjs } from "@/lib/dayjs";

const KST = "Asia/Seoul";

/** KST 시각을 만든다 — 주기 경계 판정이 전부 KST 기준이라 테스트도 KST로 세운다. */
const kst = (s: string) => dayjs.tz(s, KST);

describe("주기 시작점 — KST 경계", () => {
  it("daily는 KST 자정이 경계다", () => {
    // KST 2026-08-14 00:30 → 오늘의 시작은 08-14 00:00 KST (= 08-13 15:00 UTC)
    const start = currentCycleStart("daily", kst("2026-08-14T00:30:00"));
    expect(start).toBe(kst("2026-08-14T00:00:00").toISOString());
  });

  it("monthly는 KST 1일 자정이 경계다", () => {
    const start = currentCycleStart("monthly", kst("2026-08-14T00:30:00"));
    expect(start).toBe(kst("2026-08-01T00:00:00").toISOString());
  });

  it("⚠️ KST 00~09시(UTC로는 전날)에도 오늘은 오늘이다", () => {
    // UTC로 보면 2026-08-13이지만 KST로는 08-14다. UTC 기준으로 자르면
    // 이 시간대에 돈 배치가 "어제 것"으로 잡혀 같은 날 두 번 돈다.
    const start = currentCycleStart("daily", kst("2026-08-14T08:00:00"));
    expect(start).toBe(kst("2026-08-14T00:00:00").toISOString());
  });
});

describe("이번 주기에 이미 성공했나", () => {
  const now = kst("2026-08-14T09:00:00");

  it("오늘 성공했으면 daily는 건너뛴다", () => {
    const runs = [{ status: "success", started_at: kst("2026-08-14T01:00:00").toISOString() }];
    expect(hasSucceededThisCycle(runs, "daily", now)).toBe(true);
  });

  it("어제 성공한 건 이번 주기가 아니다", () => {
    const runs = [{ status: "success", started_at: kst("2026-08-13T23:59:00").toISOString() }];
    expect(hasSucceededThisCycle(runs, "daily", now)).toBe(false);
  });

  it("이번 달 성공했으면 monthly는 건너뛴다 — 수동으로 먼저 돌린 경우가 이것", () => {
    const runs = [{ status: "success", started_at: kst("2026-08-01T10:00:00").toISOString() }];
    expect(hasSucceededThisCycle(runs, "monthly", now)).toBe(true);
  });

  it("지난달 성공은 이번 달을 막지 않는다", () => {
    const runs = [{ status: "success", started_at: kst("2026-07-31T23:00:00").toISOString() }];
    expect(hasSucceededThisCycle(runs, "monthly", now)).toBe(false);
  });

  it("실패 이력은 건너뛰기 사유가 아니다 — 다음 날 재시도해야 한다", () => {
    const runs = [{ status: "failed", started_at: kst("2026-08-14T01:00:00").toISOString() }];
    expect(hasSucceededThisCycle(runs, "daily", now)).toBe(false);
  });

  it("크론이 며칠 밀려도 따라잡는다(catch-up)", () => {
    // 마지막 성공이 8/10인데 지금이 8/14 → 이번 주기(오늘) 성공이 없으므로 실행한다
    const runs = [{ status: "success", started_at: kst("2026-08-10T00:10:00").toISOString() }];
    expect(hasSucceededThisCycle(runs, "daily", now)).toBe(false);
  });
});

describe("동시 실행 방지와 좀비 running", () => {
  const now = kst("2026-08-14T09:00:00");

  it("방금 시작한 running이 있으면 겹쳐 돌리지 않는다", () => {
    const runs = [{ status: "running", started_at: now.subtract(5, "minute").toISOString() }];
    expect(hasLiveRun(runs, now)).toBe(true);
  });

  it(`${STALE_RUNNING_MINUTES}분을 넘긴 running은 죽은 것으로 보고 무시한다`, () => {
    // 이걸 살아있다고 보면 타임아웃으로 죽은 job이 **영원히** 막힌다.
    const runs = [
      { status: "running", started_at: now.subtract(STALE_RUNNING_MINUTES + 1, "minute").toISOString() },
    ];
    expect(hasLiveRun(runs, now)).toBe(false);
  });

  it("좀비만 골라 failed로 마감한다", () => {
    const runs = [
      { run_id: "live", status: "running", started_at: now.subtract(1, "minute").toISOString() },
      { run_id: "zombie", status: "running", started_at: now.subtract(90, "minute").toISOString() },
      { run_id: "done", status: "success", started_at: now.subtract(90, "minute").toISOString() },
    ];
    expect(staleRunningIds(runs, now)).toEqual(["zombie"]);
  });
});

describe("자동 실행 파라미터 — 스키마 기본값 해석", () => {
  const now = kst("2026-08-14T09:00:00");

  it("prev_month는 KST 전월", () => {
    expect(resolveDefaultParam("prev_month", now)).toBe("2026-07");
  });

  it("cur_month / today", () => {
    expect(resolveDefaultParam("cur_month", now)).toBe("2026-08");
    expect(resolveDefaultParam("today", now)).toBe("2026-08-14");
  });

  it("리터럴 기본값은 그대로 쓴다", () => {
    expect(resolveDefaultParam("2026-03", now)).toBe("2026-03");
  });

  it("빈 문자열은 미지정", () => {
    expect(resolveDefaultParam("", now)).toBeNull();
  });

  it("마일리지런 시드 스키마(base_month=prev_month)를 그대로 해석한다", () => {
    const schema = [{ key: "base_month", default: "prev_month" }];
    expect(buildAutoParams(schema, now)).toEqual({ base_month: "2026-07" });
  });

  it("기본값 없는 필드는 안 넣는다 — evt_id가 그렇다(핸들러가 활성 시즌을 스스로 고른다)", () => {
    const schema = [{ key: "base_month", default: "prev_month" }, { key: "evt_id" }];
    expect(buildAutoParams(schema, now)).toEqual({ base_month: "2026-07" });
  });

  it("스키마가 없으면 빈 파라미터", () => {
    expect(buildAutoParams(null, now)).toEqual({});
  });
});
