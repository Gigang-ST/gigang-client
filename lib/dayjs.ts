// lib/dayjs.ts — KST 기준 날짜 유틸리티 (dayjs 기반)

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/ko";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("ko");

const KST = "Asia/Seoul";

/** KST 기준 현재 dayjs 인스턴스 (디버그 날짜 지원) */
function nowKST() {
  // NEXT_PUBLIC_ 변수는 Next.js 빌드타임에 인라인 치환되므로 process.env 직접 참조
  if (process.env.NEXT_PUBLIC_DEBUG_DATE) {
    return dayjs(process.env.NEXT_PUBLIC_DEBUG_DATE).tz(KST);
  }
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
  const today = dayjs().startOf("day");
  const target = dayjs(dateStr).startOf("day");
  const diff = target.diff(today, "day");
  if (diff === 0) return "D-DAY";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

// ---------- 시간 유틸 ----------

/** 초 단위를 "H:MM:SS" 또는 "M:SS" 형식으로 변환 */
export function secondsToTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
