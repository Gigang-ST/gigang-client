// lib/dayjs.ts — KST 기준 날짜 유틸리티 (dayjs 기반)

import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import "dayjs/locale/ko";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.locale("ko");

const KST = "Asia/Seoul";

export { dayjs };

/** KST 기준 현재 dayjs 인스턴스 */
function nowKST() {
  return dayjs().tz(KST);
}

/** KST 기준 현재 시간 Date 객체 */
export function getKSTDate(): Date {
  return nowKST().toDate();
}

/** KST 기준 오늘 'YYYY-MM-DD' */
export function todayKST(): string {
  return nowKST().format("YYYY-MM-DD");
}

/** KST 기준 오늘의 일(day) */
export function todayDayKST(): number {
  return nowKST().date();
}

/** KST 기준 이번 달 'YYYY-MM-01' */
export function currentMonthKST(): string {
  return nowKST().startOf("month").format("YYYY-MM-DD");
}

/** Date를 KST 기준 'YYYY-MM-01'로 변환 */
export function toMonthStart(date: Date): string {
  return dayjs(date).tz(KST).startOf("month").format("YYYY-MM-DD");
}

/** 'YYYY-MM-01' → 다음 달 'YYYY-MM-01' */
export function nextMonthStr(monthStr: string): string {
  return dayjs(monthStr).add(1, "month").format("YYYY-MM-01");
}

/** 'YYYY-MM-01' → 이전 달 'YYYY-MM-01' */
export function prevMonthStr(monthStr: string): string {
  return dayjs(monthStr).subtract(1, "month").format("YYYY-MM-01");
}

/** 해당 월의 총 일수 (month: 1-indexed) */
export function daysInMonth(year: number, month: number): number {
  return dayjs(`${year}-${String(month).padStart(2, "0")}-01`).daysInMonth();
}

/** 해당 월의 마지막 날 'YYYY-MM-DD' (month: 1-indexed) */
export function monthLastDay(year: number, month: number): string {
  return dayjs(`${year}-${String(month).padStart(2, "0")}-01`)
    .endOf("month")
    .format("YYYY-MM-DD");
}

/**
 * 해당 월 달력 그리드에 실제로 그려지는 첫 셀(이전 달 며칠 포함) ~ 마지막 셀(다음 달 며칠 포함) 범위.
 * (month: 1-indexed) 캘린더 데이터 조회 시 이 범위로 넘기면 앞뒤 달 일정까지 함께 받아온다.
 * SSR(page.tsx)과 클라이언트(MiniCalendar)가 동일 범위를 쓰도록 공용으로 둔다.
 *
 * - `start`/`end`: 화면에 그려지는 칸 범위(MiniCalendar의 weeks와 일치).
 * - `fetchStart`: 조회 전용 시작일 — `start`보다 1주 앞당긴다. RPC가 "시작 시각이 범위 안"인 행만
 *   주므로, 그리드 시작 직전(예: 일요일 시작 달의 전날)에 시작해 그리드 안으로 이어지는 일정이
 *   누락되는 걸 막는다. 화면 칸은 `start~end` 그대로라 당겨온 일정 중 범위 밖 건 렌더되지 않는다.
 */
export function gridDateRange(year: number, month: number): { start: string; end: string; fetchStart: string } {
  const first = dayjs.tz(`${year}-${String(month).padStart(2, "0")}-01`, "Asia/Seoul");
  const firstDow = first.day();
  const total = daysInMonth(year, month);
  // 최소 5주 보장 — MiniCalendar의 weeks 계산과 동일 기준으로 fetch/render 범위를 일치시킨다.
  const weekCount = Math.max(5, Math.ceil((firstDow + total) / 7));
  const gridStart = first.subtract(firstDow, "day");
  const gridEnd = gridStart.add(weekCount * 7 - 1, "day");
  return {
    start: gridStart.format("YYYY-MM-DD"),
    end: gridEnd.format("YYYY-MM-DD"),
    fetchStart: gridStart.subtract(7, "day").format("YYYY-MM-DD"),
  };
}

/** 날짜 문자열 → 한국어 포맷 (기본: 2026년 3월 31일 화요일) */
export function formatKoreanDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  },
): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("ko-KR", options);
}

/** 날짜 문자열 → 한국어 짧은 포맷 (예: 3월 15일) */
export function formatKoreanShortDate(dateStr: string): string {
  return formatKoreanDate(dateStr, { month: "short", day: "numeric" });
}

/** 날짜 범위를 한국어 포맷으로 변환 (예: 2026년 3월 31일 ~ 4월 1일 화요일) */
export function formatDateRange(start: string, end?: string | null): string {
  if (!end || end === start) {
    return formatKoreanDate(start);
  }

  const startDay = dayjs(start);
  const endDay = dayjs(end);
  const sameYear = startDay.year() === endDay.year();
  const sameMonth = sameYear && startDay.month() === endDay.month();

  const startText = new Date(`${start}T00:00:00`).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const endText = new Date(`${end}T00:00:00`).toLocaleDateString("ko-KR", {
    year: sameYear ? undefined : "numeric",
    month: sameMonth ? undefined : "long",
    day: "numeric",
    weekday: "long",
  });

  return `${startText} ~ ${endText}`;
}

/** 'YYYY-MM-DD' 문자열을 Date 객체로 변환 (로컬 시간대) */
export function parseDate(dateStr: string): Date {
  return dayjs(dateStr).toDate();
}

// ---------- D-Day ----------

/** "YYYY-MM-DD" 날짜의 D-Day 문자열 반환 (예: "D-3", "D-DAY", "D+1") */
export function formatDDay(dateStr: string): string {
  const today = dayjs().tz(KST).startOf("day");
  const target = dayjs(dateStr).tz(KST).startOf("day");
  const diff = target.diff(today, "day");
  if (diff === 0) return "D-DAY";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

// ---------- 시간 유틸 ----------

/** 초 → "H:MM:SS" 또는 "M:SS" */
export function secondsToTime(totalSeconds: number): string {
  const d = dayjs.duration(totalSeconds, "seconds");
  const h = Math.floor(d.asHours());
  const m = d.minutes();
  const s = d.seconds();
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "H:MM:SS" 또는 "M:SS" → 초 (유효하지 않으면 null) */
export function timeStringToSeconds(timeStr: string): number | null {
  const parts = timeStr.trim().split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (h < 0 || m < 0 || m > 59 || s < 0 || s > 59) return null;
    return dayjs.duration({ hours: h, minutes: m, seconds: s }).asSeconds();
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    if (m < 0 || s < 0 || s > 59) return null;
    return dayjs.duration({ minutes: m, seconds: s }).asSeconds();
  }
  return null;
}

/** 페이스(분/km) → "M'SS"" */
export function paceToString(paceMin: number): string {
  const m = Math.floor(paceMin);
  const s = Math.round((paceMin - m) * 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}

/** 1년 전 날짜 문자열 (YYYY-MM-DD) */
export function oneYearAgoDateString(): string {
  return dayjs().subtract(1, "year").format("YYYY-MM-DD");
}

/** ISO 문자열을 KST 기준 'YYYY-MM-DD HH:mm' 포맷으로 변환 */
export function formatKSTDateTime(iso: string | null | undefined): string {
  if (!iso) return "기록 없음";
  return dayjs(iso).tz(KST).format("YYYY-MM-DD HH:mm");
}
