import { describe, expect, it } from "vitest";

import { seedScheduleMonths } from "@/lib/schedule-list";
import type { CalendarRace } from "@/components/home/mini-calendar";

function race(id: string, start_date: string): CalendarRace {
  return { id, title: id, start_date, type: "gigang" };
}

/**
 * 리스트뷰 시드는 캘린더가 들고 있던 **그리드 범위** 데이터다 —
 * 이번 달 앞뒤로 며칠씩(+fetchStart 1주) 삐져나온다.
 * 그 부분 월을 남기면 무한스크롤 커서(월 경계)가 나머지 날짜를 건너뛴다.
 */
describe("seedScheduleMonths", () => {
  it("앞뒤 달로 삐져나온 부분 데이터는 버린다", () => {
    // 2026-09 그리드(주 시작 일요일): 08-23 ~ 10-03
    const seeded = seedScheduleMonths(
      [
        race("aug-25", "2026-08-25"),
        race("sep-01", "2026-09-01"),
        race("sep-30", "2026-09-30"),
        race("oct-02", "2026-10-02"), // 10/2 트랜스제주 — 이게 남으면 10월이 "로드 완료"로 오인된다
      ],
      "2026-09",
    );

    expect(seeded.map((m) => m.monthKey)).toEqual(["2026-09"]);
    expect(seeded[0].races.map((r) => r.id)).toEqual(["sep-01", "sep-30"]);
  });

  it("남은 월은 항상 하나 — oldest와 newest가 같아 커서가 온전한 월 경계에서 출발한다", () => {
    const seeded = seedScheduleMonths(
      [race("oct-31", "2026-10-31"), race("nov-01", "2026-11-01")],
      "2026-10",
    );

    expect(seeded).toHaveLength(1);
    expect(seeded[0].monthKey).toBe("2026-10");
    expect(seeded[0].races.map((r) => r.id)).toEqual(["oct-31"]);
  });

  it("날짜 오름차순으로 정렬한다", () => {
    const seeded = seedScheduleMonths(
      [race("c", "2026-09-20"), race("a", "2026-09-03"), race("b", "2026-09-11")],
      "2026-09",
    );

    expect(seeded[0].races.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("이번 달에 일정이 하나도 없으면 빈 달 하나를 세운다 — 월 헤더가 사라지지 않게", () => {
    const seeded = seedScheduleMonths([race("oct-02", "2026-10-02")], "2026-09");

    expect(seeded).toEqual([{ monthKey: "2026-09", races: [] }]);
  });

  it("시드가 통째로 비어도 이번 달 하나를 세운다", () => {
    expect(seedScheduleMonths([], "2026-09")).toEqual([{ monthKey: "2026-09", races: [] }]);
  });
});
