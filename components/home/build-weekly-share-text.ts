import { dayjs } from "@/lib/dayjs";

import { matchesFilter, type FilterType } from "@/components/home/schedule-filter";

import type { CalendarRace } from "@/components/home/mini-calendar";

const KST = "Asia/Seoul";

/** 기준 날짜('YYYY-MM-DD')가 속한 주(월~일, KST)의 시작·끝 */
export function weekRangeKST(baseDate: string): { start: string; end: string } {
  const base = dayjs.tz(baseDate, KST).startOf("day");
  const monday = base.subtract((base.day() + 6) % 7, "day"); // day(): 일=0 → 월요일로 당김
  return { start: monday.format("YYYY-MM-DD"), end: monday.add(6, "day").format("YYYY-MM-DD") };
}

/** 오늘이 속한 주(월~일, KST) */
export function currentWeekRangeKST(): { start: string; end: string } {
  return weekRangeKST(dayjs().tz(KST).format("YYYY-MM-DD"));
}

/** 필터별 헤더 표기 — 칩 라벨과 동일한 어휘 사용 */
const FILTER_HEADER_LABEL: Record<FilterType, string> = {
  all: "일정",
  mine: "내 일정",
  competition: "대회",
  schedule: "정보",
  gathering: "모임",
};

/** 항목 한 줄: "· 화 07:00  남산 모닝런 — 5/10명" */
function buildLine(race: CalendarRace): string {
  const dayLabel = dayjs(race.start_date).format("ddd");
  const timeLabel = race.evt_stt_at ? dayjs(race.evt_stt_at).tz(KST).format("HH:mm") : "";

  // 모임·대회 공통 — 인원수만 담백하게 (정원 있는 모임은 n/m명)
  let countLabel = "";
  if ((race.regCount ?? 0) > 0) {
    countLabel = race.maxPrtCnt != null
      ? ` — ${race.regCount}/${race.maxPrtCnt}명`
      : ` — ${race.regCount}명`;
  }

  const when = timeLabel ? `${dayLabel} ${timeLabel}` : dayLabel;
  return `· ${when}  ${race.title}${countLabel}`;
}

/**
 * 이번 주(월~일 KST) 일정을 단톡방 공유용 텍스트로 조립한다.
 * 일정이 하나도 없으면 null 반환 (호출부에서 안내 토스트 처리).
 *
 * @param races 캘린더에 로드된 전체 항목 (대회·일정·모임, 중복 id 허용 — 내부에서 dedupe)
 * @param origin 사이트 주소 (예: https://gigang.team)
 * @param filterType 현재 필터 칩 — 걸려 있으면 그 종류만 공유 (기본 "all")
 * @param baseDate 주간 기준 날짜 'YYYY-MM-DD' — 캘린더뷰는 선택 날짜, 리스트뷰는 오늘 (기본 오늘)
 */
export function buildWeeklyShareText(
  races: CalendarRace[],
  origin: string,
  filterType: FilterType = "all",
  baseDate?: string,
): string | null {
  const today = dayjs().tz(KST).format("YYYY-MM-DD");
  const { start, end } = weekRangeKST(baseDate ?? today);
  // 지난 요일은 제외 — 이번 주면 오늘부터, 지난 주 선택이면 전부 잘려 null
  const from = today > start ? today : start;
  if (from > end) return null;

  // myRaces↔gigangRaces에 같은 대회가 양쪽에 있을 수 있어 id로 dedupe
  const seen = new Set<string>();
  const thisWeek = races
    .filter((r) => {
      if (!matchesFilter(r, filterType)) return false;
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      // 기간 일정은 남은 범위와 겹치면 포함 (start_date만 있는 항목은 그 날짜 기준)
      const rEnd = r.end_date ?? r.start_date;
      return r.start_date <= end && rEnd >= from;
    })
    .sort((a, b) =>
      a.start_date === b.start_date
        ? (a.evt_stt_at ?? "").localeCompare(b.evt_stt_at ?? "")
        : a.start_date.localeCompare(b.start_date),
    );

  if (thisWeek.length === 0) return null;

  const rangeLabel = `${dayjs(from).format("M/D")} ~ ${dayjs(end).format("M/D")}`;
  // 오늘이 속한 주만 "이번 주" — 미래 주 선택 시엔 범위만 표기
  const isCurrentWeek = today >= start && today <= end;
  return [
    `🗓️ ${isCurrentWeek ? "이번 주 " : ""}기강 ${FILTER_HEADER_LABEL[filterType]} (${rangeLabel})`,
    "",
    ...thisWeek.map(buildLine),
    "",
    `👉 ${origin}`,
  ].join("\n");
}
