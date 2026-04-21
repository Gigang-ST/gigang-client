import { calcDailyNeeded, calcMonthRefundRate } from "@/lib/mileage";

export type CrewChartMember = {
  id: string;
  name: string;
  goalKm: number;
};

export type CrewDailyPoint = Record<string, number | string> & { day: number };

export type RankedMember = {
  member: CrewChartMember;
  currentKm: number;
  percent: number;
  roundedRankValue: number;
};

export type StatsRow = {
  id: string;
  rank: number;
  name: string;
  goalKm: number;
  currentKm: number;
  percent: number;
  dailyNeed: number | "done";
};

export const ROLE_COLORS = {
  me: "#0064DC",
  top: ["#B91414", "#FF4600", "#FF7300"] as const,
  bottom: ["#46AAC8", "#7864E6", "#8C32DC"] as const,
  near: ["#E6C74A", "#AADC00", "#228B22", "#82D2B4"] as const,
};

export function round1(value: number): number {
  return Number(value.toFixed(1));
}

export function rankMembers(
  members: CrewChartMember[],
  mileageData: CrewDailyPoint[],
  percentData: CrewDailyPoint[],
  dayRef: number,
  mode: "mileage" | "percent",
  options?: {
    includeZeroKm?: boolean;
  },
): RankedMember[] {
  const rowIdx = Math.max(dayRef - 1, 0);
  const mRow = mileageData[rowIdx];
  const pRow = percentData[rowIdx];
  if (!mRow) return [];
  if (mode === "percent" && !pRow) return [];

  const includeZeroKm = options?.includeZeroKm ?? false;

  return members
    .filter((member) => (mode === "percent" ? member.goalKm > 0 : true))
    .map((member) => {
      const currentKmRaw = mRow[member.id];
      const percentRaw = pRow?.[member.id];
      const currentKm = typeof currentKmRaw === "number" ? currentKmRaw : 0;
      const percent = typeof percentRaw === "number" ? percentRaw : 0;
      const rankValue = mode === "mileage" ? currentKm : percent;
      return {
        member,
        currentKm: round1(currentKm),
        percent: round1(percent),
        roundedRankValue: round1(rankValue),
      };
    })
    .filter((item) => includeZeroKm || item.currentKm > 0)
    .sort((a, b) => {
      if (b.roundedRankValue !== a.roundedRankValue) {
        return b.roundedRankValue - a.roundedRankValue;
      }
      const nameCmp = a.member.name.localeCompare(b.member.name, "ko");
      if (nameCmp !== 0) return nameCmp;
      return a.member.id.localeCompare(b.member.id);
    });
}

function getNearMembers(ranked: RankedMember[], meIdx: number): RankedMember[] {
  let wantAbove = 2;
  let wantBelow = 2;
  const availableAbove = meIdx;
  const availableBelow = ranked.length - meIdx - 1;

  if (availableBelow < wantBelow) {
    wantAbove += wantBelow - availableBelow;
    wantBelow = availableBelow;
  }
  if (availableAbove < wantAbove) {
    wantBelow += wantAbove - availableAbove;
    wantAbove = availableAbove;
  }

  const near: RankedMember[] = [];
  for (let i = meIdx - wantAbove; i < meIdx; i++) near.push(ranked[i]!);
  for (let i = meIdx + 1; i <= meIdx + wantBelow; i++) near.push(ranked[i]!);
  return near;
}

export function selectMembersForChart(
  ranked: RankedMember[],
  meId?: string,
): {
  selected: RankedMember[];
  top: RankedMember[];
  bottom: RankedMember[];
  near: RankedMember[];
} {
  if (ranked.length <= 11) {
    return { selected: ranked, top: ranked.slice(0, 3), bottom: ranked.slice(-3), near: [] };
  }

  const meIdx = meId ? ranked.findIndex((r) => r.member.id === meId) : -1;
  if (meIdx < 0) {
    const selected = ranked.slice(0, 11);
    return { selected, top: selected.slice(0, 3), bottom: selected.slice(-3), near: [] };
  }

  const top = ranked.slice(0, 3);
  const bottom = ranked.slice(-3);
  const me = ranked[meIdx]!;
  const near = getNearMembers(ranked, meIdx);
  const selectedMap = new Map<string, RankedMember>();
  [...top, ...bottom, me, ...near].forEach((item) => selectedMap.set(item.member.id, item));
  const bottomIdSet = new Set(bottom.map((item) => item.member.id));
  const meRank = meIdx + 1;

  const extras = ranked
    .filter((item) => !selectedMap.has(item.member.id))
    .filter((item) => !bottomIdSet.has(item.member.id))
    .sort((a, b) => {
      const aRank = ranked.findIndex((r) => r.member.id === a.member.id) + 1;
      const bRank = ranked.findIndex((r) => r.member.id === b.member.id) + 1;
      const diff = Math.abs(aRank - meRank) - Math.abs(bRank - meRank);
      if (diff !== 0) return diff;
      return a.member.name.localeCompare(b.member.name, "ko");
    });

  for (const extra of extras) {
    if (selectedMap.size >= 11) break;
    selectedMap.set(extra.member.id, extra);
  }
  if (selectedMap.size < 11) {
    for (const extra of ranked) {
      if (selectedMap.size >= 11) break;
      if (!selectedMap.has(extra.member.id)) selectedMap.set(extra.member.id, extra);
    }
  }

  return {
    selected: ranked.filter((item) => selectedMap.has(item.member.id)).slice(0, 11),
    top,
    bottom,
    near,
  };
}

export function buildRoleColorMap(
  selected: RankedMember[],
  top: RankedMember[],
  bottom: RankedMember[],
  near: RankedMember[],
  meId?: string,
): Map<string, string> {
  const colorMap = new Map<string, string>();
  if (meId) colorMap.set(meId, ROLE_COLORS.me);
  top.forEach((item, idx) => {
    if (item.member.id !== meId) colorMap.set(item.member.id, ROLE_COLORS.top[idx % ROLE_COLORS.top.length]!);
  });
  bottom.forEach((item, idx) => {
    if (item.member.id !== meId && !colorMap.has(item.member.id)) {
      colorMap.set(item.member.id, ROLE_COLORS.bottom[idx % ROLE_COLORS.bottom.length]!);
    }
  });
  near.forEach((item, idx) => {
    if (item.member.id !== meId && !colorMap.has(item.member.id)) {
      colorMap.set(item.member.id, ROLE_COLORS.near[idx % ROLE_COLORS.near.length]!);
    }
  });
  let fallbackIdx = 0;
  for (const item of selected) {
    if (!colorMap.has(item.member.id)) {
      colorMap.set(item.member.id, ROLE_COLORS.near[fallbackIdx % ROLE_COLORS.near.length]!);
      fallbackIdx += 1;
    }
  }
  return colorMap;
}

export function buildStatsRows(
  rankedByMileage: RankedMember[],
  dayRef: number,
  totalDays: number,
): StatsRow[] {
  return rankedByMileage.map((item, idx) => ({
    id: item.member.id,
    rank: idx + 1,
    name: item.member.name,
    goalKm: item.member.goalKm,
    currentKm: item.currentKm,
    percent: round1(calcMonthRefundRate(item.currentKm, item.member.goalKm) * 100),
    dailyNeed: calcDailyNeeded(item.currentKm, item.member.goalKm, dayRef, totalDays),
  }));
}
