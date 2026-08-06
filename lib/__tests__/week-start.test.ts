import { describe, expect, it } from "vitest";

import { dayjs, gridDateRange, gridFetchRange, daysInMonth } from "@/lib/dayjs";
import {
  DEFAULT_WEEK_START,
  WEEK_STARTS,
  parseWeekStart,
  weekdayColumn,
  weekdayLabels,
  type WeekStart,
} from "@/lib/week-start";

/**
 * 이 변경의 실패 모드는 "조용함"이다 — 날짜가 한 칸 밀리거나 조회 범위가 그리드를 못 덮으면
 * 에러 없이 **일정만 안 보인다.** 그래서 두 시작 요일 × 24개월을 전수로 돌려 못박는다.
 */
const MONTHS: [number, number][] = Array.from({ length: 24 }, (_, i) => {
  const d = dayjs.tz("2026-01-01", "Asia/Seoul").add(i, "month");
  return [d.year(), d.month() + 1];
});

/** 'YYYY-MM-DD'의 KST 요일 번호(0=일) */
function dowOf(date: string): number {
  return dayjs.tz(date, "Asia/Seoul").day();
}

describe("parseWeekStart", () => {
  it("'1'이면 월요일, '0'이면 일요일", () => {
    expect(parseWeekStart("1")).toBe(1);
    expect(parseWeekStart("0")).toBe(0);
  });

  it("없거나 알 수 없는 값이면 기본(일요일)로 떨어진다", () => {
    // 쿠키는 사용자가 직접 고칠 수 있어 아무 문자열이나 들어올 수 있다.
    // 통과시키면 weekdayColumn이 범위 밖 인덱스를 만들어 그리드가 통째로 어긋난다.
    for (const raw of [undefined, null, "", "2", "-1", "7", "월요일", "abc", "1.5", "NaN"]) {
      expect(parseWeekStart(raw)).toBe(DEFAULT_WEEK_START);
    }
  });

  it("기본값은 일요일 — 한국 종이달력·네이버·카카오 관행", () => {
    expect(DEFAULT_WEEK_START).toBe(0);
  });
});

describe("weekdayColumn", () => {
  it("일요일 시작이면 dayjs .day()를 그대로 쓴다(기존 동작 보존)", () => {
    for (let dow = 0; dow < 7; dow++) {
      expect(weekdayColumn(dow, 0)).toBe(dow);
    }
  });

  it("월요일 시작이면 월=0 … 일=6", () => {
    expect(weekdayColumn(1, 1)).toBe(0); // 월
    expect(weekdayColumn(6, 1)).toBe(5); // 토
    expect(weekdayColumn(0, 1)).toBe(6); // 일 — 맨 끝으로 간다
  });

  it("어떤 시작 요일에서도 0~6을 벗어나지 않는다", () => {
    for (const ws of WEEK_STARTS) {
      const cols = Array.from({ length: 7 }, (_, dow) => weekdayColumn(dow, ws));
      expect([...cols].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });
});

describe("weekdayLabels", () => {
  it("시작 요일에 맞춰 회전한다", () => {
    expect(weekdayLabels(0)).toEqual(["일", "월", "화", "수", "목", "금", "토"]);
    expect(weekdayLabels(1)).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
  });

  it("라벨 순서가 weekdayColumn과 일치한다", () => {
    // 헤더가 라벨을 회전시키는 순서와 셀이 열을 배치하는 순서가 어긋나면
    // "화요일 칸 아래에 수요일 날짜"가 뜬다 — 색상만 맞아 눈치채기 어렵다.
    for (const ws of WEEK_STARTS) {
      const labels = weekdayLabels(ws);
      for (let dow = 0; dow < 7; dow++) {
        expect(labels[weekdayColumn(dow, ws)]).toBe(weekdayLabels(0)[dow]);
      }
    }
  });

  it("일·토가 항상 들어 있다(헤더 색상이 라벨 문자열로 걸려 있음)", () => {
    for (const ws of WEEK_STARTS) {
      expect(weekdayLabels(ws)).toContain("일");
      expect(weekdayLabels(ws)).toContain("토");
    }
  });
});

describe("gridDateRange — 시작 요일별 그리드", () => {
  it("그리드 첫 칸은 항상 그 시작 요일이다", () => {
    for (const ws of WEEK_STARTS) {
      for (const [y, m] of MONTHS) {
        const { start } = gridDateRange(y, m, ws);
        expect(weekdayColumn(dowOf(start), ws)).toBe(0);
      }
    }
  });

  it("그리드는 그 달 1일~말일을 모두 포함한다", () => {
    for (const ws of WEEK_STARTS) {
      for (const [y, m] of MONTHS) {
        const { start, end } = gridDateRange(y, m, ws);
        const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
        const lastDay = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
        expect(start <= firstDay).toBe(true);
        expect(end >= lastDay).toBe(true);
      }
    }
  });

  it("칸 수는 항상 7의 배수이고 최소 5주다", () => {
    for (const ws of WEEK_STARTS) {
      for (const [y, m] of MONTHS) {
        const { start, end } = gridDateRange(y, m, ws);
        const cells = dayjs.tz(end, "Asia/Seoul").diff(dayjs.tz(start, "Asia/Seoul"), "day") + 1;
        expect(cells % 7).toBe(0);
        expect(cells).toBeGreaterThanOrEqual(35);
      }
    }
  });

  it("fetchStart는 그리드 시작보다 1주 앞선다(그리드로 이어지는 일정 누락 방지)", () => {
    for (const ws of WEEK_STARTS) {
      for (const [y, m] of MONTHS) {
        const { start, fetchStart } = gridDateRange(y, m, ws);
        expect(dayjs.tz(start, "Asia/Seoul").diff(dayjs.tz(fetchStart, "Asia/Seoul"), "day")).toBe(7);
      }
    }
  });

  it("일요일 시작 결과는 시작 요일 도입 전과 동일하다(기존 회원 무영향)", () => {
    // 기본값을 쓰는 회원의 그리드가 1px도 달라지면 안 된다.
    for (const [y, m] of MONTHS) {
      const first = dayjs.tz(`${y}-${String(m).padStart(2, "0")}-01`, "Asia/Seoul");
      const legacyFirstDow = first.day(); // 도입 전 코드: .day() 그대로
      const legacyWeekCount = Math.max(5, Math.ceil((legacyFirstDow + daysInMonth(y, m)) / 7));
      const legacyStart = first.subtract(legacyFirstDow, "day");
      expect(gridDateRange(y, m, 0)).toEqual({
        start: legacyStart.format("YYYY-MM-DD"),
        end: legacyStart.add(legacyWeekCount * 7 - 1, "day").format("YYYY-MM-DD"),
        fetchStart: legacyStart.subtract(7, "day").format("YYYY-MM-DD"),
      });
    }
  });
});

describe("gridFetchRange — 팀 공용 캐시가 두 시작 요일을 한 엔트리로 서빙", () => {
  it("모든 시작 요일의 조회 범위를 덮는다", () => {
    // 이게 깨지면 캐시가 못 덮는 가장자리 날짜의 일정이 **에러 없이 사라진다.**
    // 캐시 엔트리를 쪼개지 않기로 한 결정이 성립하는 근거가 정확히 이 불변식이다.
    for (const [y, m] of MONTHS) {
      const union = gridFetchRange(y, m);
      for (const ws of WEEK_STARTS) {
        const own = gridDateRange(y, m, ws);
        expect(union.fetchStart <= own.fetchStart).toBe(true);
        expect(union.end >= own.end).toBe(true);
      }
    }
  });

  it("합집합이 필요 이상으로 넓지 않다(둘 중 하나의 경계와 맞닿는다)", () => {
    // 페이로드가 모든 회원에게 나가므로 "넉넉하게 한 달"식으로 부풀리지 않는다.
    for (const [y, m] of MONTHS) {
      const union = gridFetchRange(y, m);
      const owns = WEEK_STARTS.map((ws) => gridDateRange(y, m, ws));
      expect(owns.some((o) => o.fetchStart === union.fetchStart)).toBe(true);
      expect(owns.some((o) => o.end === union.end)).toBe(true);
    }
  });

  it("시작 요일이 하나뿐인 것처럼 좁아지지 않는다", () => {
    // 두 그리드가 실제로 다른 달이 하나라도 있어야 이 합집합에 의미가 있다.
    const differs = MONTHS.filter(([y, m]) => {
      const a = gridDateRange(y, m, 0);
      const b = gridDateRange(y, m, 1);
      return a.start !== b.start || a.end !== b.end;
    });
    expect(differs.length).toBeGreaterThan(0);
  });
});

describe("타입 표면", () => {
  it("WEEK_STARTS는 일요일·월요일 둘뿐이다", () => {
    // 값을 늘리면 설정 UI(2지 선택)와 gridFetchRange 비용이 함께 움직인다.
    const all: readonly WeekStart[] = WEEK_STARTS;
    expect(all).toEqual([0, 1]);
  });
});
