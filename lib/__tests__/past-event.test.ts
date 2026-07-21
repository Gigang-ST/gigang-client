import { describe, expect, it } from "vitest";

import { dayjs, parseEventTime } from "@/lib/dayjs";
import { isPastEventKst, isPastLockedFor } from "@/lib/past-event";

describe("parseEventTime", () => {
  it("시각 정보가 있는 ISO 문자열은 절대시각 그대로 해석한다", () => {
    expect(parseEventTime("2026-07-20T10:00:00+00:00").toISOString()).toBe("2026-07-20T10:00:00.000Z");
    expect(parseEventTime("2026-07-20T10:00:00Z").toISOString()).toBe("2026-07-20T10:00:00.000Z");
  });

  it("날짜만 있는 문자열은 실행 환경 TZ와 무관하게 KST 자정으로 고정한다", () => {
    // KST 2026-07-20 00:00 = UTC 2026-07-19T15:00:00Z (프로세스 TZ가 UTC든 KST든 동일해야 함)
    expect(parseEventTime("2026-07-20").toISOString()).toBe("2026-07-19T15:00:00.000Z");
    // dayjs("2026-07-20")(로컬 자정)와 달라야 date-only 편차가 제거된 것
    expect(parseEventTime("2026-07-20").toISOString()).toBe(dayjs.tz("2026-07-20", "Asia/Seoul").toISOString());
  });

  it("공백이 섞인 날짜 문자열도 트림 후 date-only로 판정한다", () => {
    expect(parseEventTime("  2026-07-20  ").toISOString()).toBe("2026-07-19T15:00:00.000Z");
  });
});

describe("isPastEventKst — date-only 입력 안전성", () => {
  // 기준 '오늘'을 고정하지 않고, 오늘/어제/내일 KST 날짜로 상대 판정한다(실행 시점 무관).
  const todayKst = dayjs().tz("Asia/Seoul").format("YYYY-MM-DD");
  const yesterdayKst = dayjs().tz("Asia/Seoul").subtract(1, "day").format("YYYY-MM-DD");
  const tomorrowKst = dayjs().tz("Asia/Seoul").add(1, "day").format("YYYY-MM-DD");

  it("어제(KST) 날짜만 있는 일정은 지난 일정", () => {
    expect(isPastEventKst(yesterdayKst)).toBe(true);
  });

  it("오늘(KST) 날짜만 있는 일정은 자정까지 지난 일정이 아니다", () => {
    expect(isPastEventKst(todayKst)).toBe(false);
  });

  it("내일(KST) 날짜만 있는 일정은 지난 일정이 아니다", () => {
    expect(isPastEventKst(tomorrowKst)).toBe(false);
  });

  it("종료일시(endAt)가 우선한다 — 시작이 어제여도 종료가 오늘이면 지난 일정 아님", () => {
    expect(isPastEventKst(yesterdayKst, todayKst)).toBe(false);
  });
});

describe("isPastLockedFor — 관리자 예외", () => {
  const yesterdayKst = dayjs().tz("Asia/Seoul").subtract(1, "day").format("YYYY-MM-DD");

  it("관리자는 지난 일정이어도 잠기지 않는다", () => {
    expect(isPastLockedFor(true, yesterdayKst)).toBe(false);
  });

  it("일반 멤버는 지난 일정이면 잠긴다", () => {
    expect(isPastLockedFor(false, yesterdayKst)).toBe(true);
  });
});
