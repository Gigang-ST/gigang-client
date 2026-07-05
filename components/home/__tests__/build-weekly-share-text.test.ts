import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";

import { buildWeeklyShareText, currentWeekRangeKST } from "@/components/home/build-weekly-share-text";
import type { CalendarRace } from "@/components/home/mini-calendar";

const ORIGIN = "https://gigang.team";

function makeRace(partial: Partial<CalendarRace> & Pick<CalendarRace, "id" | "title" | "start_date" | "type">): CalendarRace {
  return { ...partial } as CalendarRace;
}

/** 테스트가 실행 요일과 무관하게 통과하도록 오늘/주말 기준 날짜를 쓴다 */
const today = dayjs().tz("Asia/Seoul").format("YYYY-MM-DD");
const yesterday = dayjs(today).subtract(1, "day").format("YYYY-MM-DD");

function atKST(date: string, time: string): string {
  return dayjs.tz(`${date} ${time}`, "Asia/Seoul").toISOString();
}

describe("currentWeekRangeKST", () => {
  it("월요일 시작 ~ 일요일 끝이며 오늘을 포함한다", () => {
    const { start, end } = currentWeekRangeKST();
    expect(dayjs(start).day()).toBe(1); // 월요일
    expect(dayjs(end).day()).toBe(0); // 일요일
    expect(dayjs(end).diff(dayjs(start), "day")).toBe(6);
    expect(start <= today && today <= end).toBe(true);
  });
});

describe("buildWeeklyShareText", () => {
  const { end } = currentWeekRangeKST();

  it("남은 일정이 없으면 null을 반환한다", () => {
    const races = [makeRace({ id: "a", title: "어제 모임", start_date: yesterday, type: "gathering" })];
    expect(buildWeeklyShareText(races, ORIGIN)).toBeNull();
  });

  it("지난 요일·다음 주는 빼고 남은 일정만 시간순으로 담는다", () => {
    const nextWeek = dayjs(end).add(1, "day").format("YYYY-MM-DD");
    const races = [
      makeRace({ id: "later", title: "주말 모임", start_date: end, type: "gathering", regCount: 3, evt_stt_at: atKST(end, "20:00") }),
      makeRace({ id: "past", title: "어제 모임", start_date: yesterday, type: "gathering" }),
      makeRace({ id: "out", title: "다음 주 모임", start_date: nextWeek, type: "gathering" }),
      makeRace({ id: "earlier", title: "오늘 대회", start_date: today, type: "gigang", regCount: 2, evt_stt_at: atKST(today, "07:00") }),
    ];
    const text = buildWeeklyShareText(races, ORIGIN)!;
    expect(text).toContain("이번 주 기강 일정");
    expect(text).toContain(ORIGIN);
    expect(text).not.toContain("어제 모임");
    expect(text).not.toContain("다음 주 모임");
    expect(text.indexOf("오늘 대회")).toBeLessThan(text.indexOf("주말 모임"));
    // 시작일·시간·제목만 담백하게 — 인원수 미표기
    expect(text).toContain("07:00  오늘 대회");
    expect(text).not.toContain("명");
  });

  it("같은 대회가 중복(id)으로 들어와도 한 번만 담는다", () => {
    const races = [
      makeRace({ id: "dup", title: "중복 대회", start_date: today, type: "mine", regCount: 1 }),
      makeRace({ id: "dup", title: "중복 대회", start_date: today, type: "gigang", regCount: 1 }),
    ];
    const text = buildWeeklyShareText(races, ORIGIN)!;
    expect(text.match(/중복 대회/g)).toHaveLength(1);
  });

  it("시간 있는 항목은 HH:mm을 표기하고, 인원수·종료일은 표기하지 않는다", () => {
    const races = [
      makeRace({ id: "g", title: "정원 모임", start_date: today, type: "gathering_mine", regCount: 5, maxPrtCnt: 10, evt_stt_at: atKST(today, "07:30") }),
    ];
    const text = buildWeeklyShareText(races, ORIGIN)!;
    expect(text).toContain("07:30  정원 모임");
    expect(text).not.toContain("5/10");
    expect(text).not.toContain("명");
  });

  it("기준 날짜를 주면 그 주(월~일) 전체를 담고 '이번 주' 접두어를 뺀다", () => {
    const nextMonday = dayjs(end).add(1, "day").format("YYYY-MM-DD");
    const nextSunday = dayjs(nextMonday).add(6, "day").format("YYYY-MM-DD");
    const races = [
      makeRace({ id: "n1", title: "다음주 월요 모임", start_date: nextMonday, type: "gathering" }),
      makeRace({ id: "n2", title: "다음주 일요 대회", start_date: nextSunday, type: "gigang", regCount: 4 }),
    ];
    // 다음 주 수요일을 선택한 상황
    const wednesday = dayjs(nextMonday).add(2, "day").format("YYYY-MM-DD");
    const text = buildWeeklyShareText(races, ORIGIN, "all", wednesday)!;
    expect(text).toContain("다음주 월요 모임"); // 기준일 이전 요일도 미래 주면 포함
    expect(text).toContain("다음주 일요 대회");
    expect(text).not.toContain("이번 주"); // 미래 주는 범위만 표기
  });

  it("지난 주를 선택하면 전부 지난 일정이라 null", () => {
    const { start } = currentWeekRangeKST();
    const lastWednesday = dayjs(start).subtract(5, "day").format("YYYY-MM-DD");
    const races = [
      makeRace({ id: "p1", title: "지난주 모임", start_date: lastWednesday, type: "gathering" }),
    ];
    expect(buildWeeklyShareText(races, ORIGIN, "all", lastWednesday)).toBeNull();
  });

  it("필터가 걸려 있으면 해당 종류만 담고 헤더에 필터명을 쓴다", () => {
    const races = [
      makeRace({ id: "g1", title: "모임A", start_date: today, type: "gathering" }),
      makeRace({ id: "c1", title: "대회B", start_date: today, type: "gigang" }),
    ];
    const text = buildWeeklyShareText(races, ORIGIN, "gathering")!;
    expect(text).toContain("이번 주 기강 모임");
    expect(text).toContain("모임A");
    expect(text).not.toContain("대회B");
    // 필터에 맞는 항목이 없으면 null
    expect(buildWeeklyShareText([races[1]], ORIGIN, "gathering")).toBeNull();
  });
});
