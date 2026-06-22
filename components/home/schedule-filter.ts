import type { CalendarRace } from "./mini-calendar";

export type FilterType = "all" | "competition" | "schedule" | "gathering";

export function matchesFilter(race: CalendarRace, filterType: FilterType): boolean {
  if (filterType === "all") return true;
  if (filterType === "competition") return race.type === "gigang" || race.type === "mine";
  if (filterType === "schedule") return race.type === "schedule";
  if (filterType === "gathering") return race.type === "gathering" || race.type === "gathering_mine";
  return true;
}
