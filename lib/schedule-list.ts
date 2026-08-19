import type { CalendarRace } from "@/components/home/mini-calendar";

export type ScheduleMonth = {
  /** "YYYY-MM" */
  monthKey: string;
  races: CalendarRace[];
};

/**
 * 리스트뷰의 첫 화면(시드)을 만든다 — **온전한 한 달만** 남긴다.
 *
 * 시드로 넘어오는 건 캘린더가 들고 있던 **그리드 범위** 데이터다: 이번 달 앞으로 최대
 * 13일(그리드 시작 + `fetchStart` 1주), 뒤로 며칠이 딸려 온다(`gridDateRange`). 이걸
 * 그대로 월별로 버킷팅하면 양 끝의 **부분 월이 "다 불러온 달"로 등록**되고, 무한스크롤
 * 커서는 월 경계에서 출발하므로(`get_schedule_paged`는 커서 **다음 달**부터 준다) 그 달의
 * 나머지 날짜가 영영 조회되지 않는다.
 *
 * 실제로 그랬다 — 9월 달력에서 리스트로 바꾸면 시드 범위가 08-23~10-03이라 10월 버킷에
 * 10/2 한 건만 담겼고, 그 뒤로는 11월부터 불러와 **10/4~10/31 대회 8건이 통째로 사라졌다**
 * (10월 달력에서 바꾸면 멀쩡히 나온다). 위쪽도 같아서 8/1~8/22가 실종됐다.
 * 주 시작 요일(일/월)에 따라 경계가 하루씩 밀려 재현 조건이 더 헷갈렸다.
 *
 * 버린 부분 월은 손실이 아니다 — 마운트 직후 상·하단 sentinel이 걸려 앞뒤 달을 RPC로
 * **온전하게** 다시 받는다. 화면에 남는 건 같고, 달마다 빠지는 날이 없어진다.
 */
export function seedScheduleMonths(
  races: CalendarRace[],
  monthKey: string,
): ScheduleMonth[] {
  const own = races
    .filter((race) => race.start_date.slice(0, 7) === monthKey)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  // 이번 달이 비어도 달 하나는 세운다 — 월 헤더가 사라지면 "어디를 보고 있는지"가 없어진다.
  return [{ monthKey, races: own }];
}
