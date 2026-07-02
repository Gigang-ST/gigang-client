import type { CalendarRace } from "./mini-calendar";

export type FilterType = "all" | "mine" | "competition" | "schedule" | "gathering";

export const FILTER_TYPES: readonly FilterType[] = ["all", "mine", "competition", "schedule", "gathering"];

export function matchesFilter(race: CalendarRace, filterType: FilterType): boolean {
  if (filterType === "all") return true;
  // 내 일정 = 내가 참가 신청한 대회 + 참석 등록한 모임
  if (filterType === "mine") return race.type === "mine" || race.type === "gathering_mine";
  if (filterType === "competition") return race.type === "gigang" || race.type === "mine";
  if (filterType === "schedule") return race.type === "schedule";
  if (filterType === "gathering") return race.type === "gathering" || race.type === "gathering_mine";
  return true;
}
