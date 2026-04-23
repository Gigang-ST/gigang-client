"use client";

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  useTransition,
} from "react";
import { Medal } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TooltipContentProps, TooltipValueType } from "recharts";
import { createClient } from "@/lib/supabase/client";
import {
  currentMonthKST,
  daysInMonth as getDaysInMonth,
  todayDayKST,
} from "@/lib/dayjs";
import {
  buildRoleColorMap,
  buildStatsRows,
  rankMembers,
  ROLE_COLORS,
  selectMembersForChart,
  type RankedMember,
  type StatsRow,
} from "@/lib/projects/crew-progress-chart";
import { SegmentControl } from "@/components/common/segment-control";
import { Body } from "@/components/common/typography";
import { Skeleton } from "@/components/ui/skeleton";

export type DailyPoint = Record<string, number | string> & { day: number };

export type ChartMember = { id: string; name: string; goalKm: number };

export type ChartInitialData = {
  mileageData: DailyPoint[];
  percentData: DailyPoint[];
  members: ChartMember[];
  myGoalKm: number;
  myName: string | null;
  totalDays: number;
};

type ChartTooltipProps = TooltipContentProps<TooltipValueType, string | number> & {
  myName: string | null;
  mode: "mileage" | "percent" | "stats";
};

/** recharts NameType = string | number — Tooltip 인라인 컴포넌트 방지 */
function ChartTooltip({ active, payload, label, myName, mode }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const sorted = [...payload].sort((a, b) => {
    const va = typeof a.value === "number" ? a.value : 0;
    const vb = typeof b.value === "number" ? b.value : 0;
    return vb - va;
  });

  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{label}일</p>
      {sorted.map((entry) => (
        <p
          key={String(entry.dataKey)}
          className={
            entry.name === myName ? "font-bold" : "text-muted-foreground"
          }
          style={{ color: entry.color }}
        >
          {entry.name}:{" "}
          {mode === "percent"
            ? `${Number(entry.value).toFixed(1)}%`
            : `${Number(entry.value).toFixed(1)} km`}
        </p>
      ))}
    </div>
  );
}

type CrewProgressChartProps = {
  evtId: string;
  memId?: string;
  month: string;
  initialData?: ChartInitialData | null;
};

type MemberPercentBar = {
  memId: string;
  name: string;
  percent: number;
  barPercent: number;
  boosted: boolean;
  currentKm: number;
  goalKm: number;
};

type StatsSortKey = "rank" | "goalKm" | "currentKm" | "percent";
type StatsSortDir = "asc" | "desc";
type AriaSortValue = "none" | "ascending" | "descending";

type PercentBarTooltipProps = {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  myName: string | null;
};

/** 달성률 막대 — dataKey 이름(percent)이 노출되지 않도록 전용 툴팁 */
function PercentBarTooltip({
  active,
  payload,
  myName,
}: PercentBarTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as MemberPercentBar | undefined;
  if (!row) return null;

  const isMe = row.name === myName;
  const goalText =
    row.goalKm > 0 ? `${row.goalKm.toFixed(1)}km` : "-";

  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className={`mb-0.5 font-semibold ${isMe ? "" : "text-muted-foreground"}`}>
        {row.name}
      </p>
      <p className={isMe ? "" : "text-muted-foreground"}>
        {row.percent.toFixed(1)}% ({row.currentKm.toFixed(1)}km/{goalText})
        {row.boosted ? (
          <span className="ml-1">🚀</span>
        ) : null}
      </p>
    </div>
  );
}

function getPercentCellClass(percent: number): string {
  if (percent <= 20) return "bg-[#EF9A9A]";
  if (percent <= 40) return "bg-[#FFCC80]";
  if (percent <= 60) return "bg-[#FFF59D]";
  if (percent <= 80) return "bg-[#C5E1A5]";
  return "bg-[#A5D6A7]";
}

export function CrewProgressChart({
  evtId,
  memId,
  month,
  initialData,
}: CrewProgressChartProps) {
  const [mode, setMode] = useState<"mileage" | "percent" | "stats">("mileage");
  const [statsSortKey, setStatsSortKey] = useState<StatsSortKey>("currentKm");
  const [statsSortDir, setStatsSortDir] = useState<StatsSortDir>("desc");
  const [mileageData, setMileageData] = useState<DailyPoint[]>(
    initialData?.mileageData ?? [],
  );
  const [percentData, setPercentData] = useState<DailyPoint[]>(
    initialData?.percentData ?? [],
  );
  const [members, setMembers] = useState<ChartMember[]>(
    initialData?.members ?? [],
  );
  const [myGoalKm, setMyGoalKm] = useState<number>(
    initialData?.myGoalKm ?? 0,
  );
  const [myName, setMyName] = useState<string | null>(
    initialData?.myName ?? null,
  );
  const [totalDays, setTotalDays] = useState(initialData?.totalDays ?? 30);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const didPreloadSecondary = useRef(false);
  const hasLoadedDataRef = useRef(
    (initialData?.mileageData.length ?? 0) > 0 && (initialData?.members.length ?? 0) > 0,
  );
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const hasExistingData = hasLoadedDataRef.current;
    if (hasExistingData) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const supabase = createClient();

    const [y, m] = month.split("-").map(Number);
    const totalDaysInMonth = getDaysInMonth(y, m);
    setTotalDays(totalDaysInMonth);
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(totalDaysInMonth).padStart(2, "0")}`;

    const { data: participants } = await supabase
      .from("evt_team_prt_rel")
      .select("prt_id, mem_id, init_goal, mem_mst!inner(mem_nm)")
      .eq("evt_id", evtId)
      .eq("aprv_yn", true)
      .lte("stt_mth", month);

    if (!participants || participants.length === 0) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [{ data: logs }, { data: goals }] = await Promise.all([
      supabase
        .from("evt_mlg_act_hist")
        .select("prt_id, act_dt, final_mlg")
        .in("prt_id", participants.map((p) => p.prt_id))
        .gte("act_dt", month)
        .lte("act_dt", monthEnd),
      supabase
        .from("evt_mlg_mth_snap")
        .select("prt_id, goal_mlg")
        .in("prt_id", participants.map((p) => p.prt_id))
        .eq("base_dt", month),
    ]);

    const memIdByPrtId = new Map<string, string>();
    for (const p of participants) {
      memIdByPrtId.set(p.prt_id, p.mem_id);
    }

    const goalByMemId = new Map<string, number>();
    for (const g of goals ?? []) {
      const mappedMemId = memIdByPrtId.get(g.prt_id);
      if (!mappedMemId) continue;
      goalByMemId.set(mappedMemId, Number(g.goal_mlg));
    }

    if (memId) {
      const myP = participants.find((p) => p.mem_id === memId);
      if (myP) {
        const goalKm = goalByMemId.get(memId) ?? Number(myP.init_goal ?? 0);
        setMyGoalKm(goalKm);
        setMyName(
          (myP.mem_mst as unknown as { mem_nm: string }).mem_nm,
        );
      }
    }

    const memIdsWithLogs = new Set(
      (logs ?? [])
        .map((l) => memIdByPrtId.get(l.prt_id))
        .filter((id): id is string => Boolean(id)),
    );
    const activeParticipants = participants.filter(
      (p) =>
        memIdsWithLogs.has(p.mem_id) ||
        goalByMemId.has(p.mem_id) ||
        Number(p.init_goal ?? 0) > 0,
    );

    const logsByMem = new Map<string, { day: number; val: number }[]>();
    for (const log of logs ?? []) {
      const memId = memIdByPrtId.get(log.prt_id);
      if (!memId) continue;
      const day = Number(log.act_dt.split("-")[2]);
      const existing = logsByMem.get(memId) ?? [];
      existing.push({ day, val: Number(log.final_mlg) });
      logsByMem.set(memId, existing);
    }

    const dailyCumByMem = new Map<string, Map<number, number>>();
    for (const p of activeParticipants) {
      const entries = logsByMem.get(p.mem_id) ?? [];
      const sorted = [...entries].sort((a, b) => a.day - b.day);
      const dayMap = new Map<number, number>();
      let cum = 0;
      for (const e of sorted) {
        cum += e.val;
        dayMap.set(e.day, Number(cum.toFixed(2)));
      }
      dailyCumByMem.set(p.mem_id, dayMap);
    }

    const mPoints: DailyPoint[] = [];
    const pPoints: DailyPoint[] = [];

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const mPoint: DailyPoint = { day: d };
      const pPoint: DailyPoint = { day: d };

      for (const p of activeParticipants) {
        const dayMap = dailyCumByMem.get(p.mem_id);
        let val = 0;
        if (dayMap) {
          for (let dd = d; dd >= 1; dd--) {
            if (dayMap.has(dd)) {
              val = dayMap.get(dd)!;
              break;
            }
          }
        }
        mPoint[p.mem_id] = Number(val.toFixed(1));
        const goal =
          goalByMemId.get(p.mem_id) ?? Number(p.init_goal ?? 0);
        pPoint[p.mem_id] =
          goal > 0
            ? Number(((val / goal) * 100).toFixed(1))
            : 0;
      }

      mPoints.push(mPoint);
      pPoints.push(pPoint);
    }

    const memberList: ChartMember[] = activeParticipants.map((p) => ({
      id: p.mem_id,
      name: (p.mem_mst as unknown as { mem_nm: string }).mem_nm,
      goalKm: goalByMemId.get(p.mem_id) ?? Number(p.init_goal ?? 0),
    }));

    setMembers(memberList);
    setMileageData(mPoints);
    setPercentData(pPoints);
    hasLoadedDataRef.current = memberList.length > 0 && mPoints.length > 0;
    setLoading(false);
    setRefreshing(false);
  }, [evtId, memId, month]);

  // initialData 없을 때만 초기 fetch
  useEffect(() => {
    if (!initialData) {
      load();
    }
  }, [initialData, load]);

  // 서버 초기 렌더에서 비기본 탭(달성률/통계) 데이터가 비어 있으면 백그라운드 재조회
  useEffect(() => {
    if (!initialData || didPreloadSecondary.current) return;
    if (initialData.percentData.length > 0) return;
    didPreloadSecondary.current = true;
    startTransition(() => {
      void load();
    });
  }, [initialData, load, startTransition]);

  // mileage:refresh 이벤트 → 클라이언트 재조회
  useEffect(() => {
    const handler = () => load();
    window.addEventListener("mileage:refresh", handler);
    return () => window.removeEventListener("mileage:refresh", handler);
  }, [load]);

  const isCurrentMonth = month === currentMonthKST();
  const dayRef = isCurrentMonth ? Math.min(todayDayKST(), totalDays) : totalDays;

  const rankedByMileage = useMemo(
    () => rankMembers(members, mileageData, percentData, dayRef, "mileage"),
    [members, mileageData, percentData, dayRef],
  );
  const rankedByPercent = useMemo(
    () => rankMembers(members, mileageData, percentData, dayRef, "percent"),
    [members, mileageData, percentData, dayRef],
  );
  const rankedForStats = useMemo(
    () =>
      rankMembers(members, mileageData, percentData, dayRef, "mileage", {
        includeZeroKm: true,
      }),
    [members, mileageData, percentData, dayRef],
  );
  const rankedForMode = mode === "percent" ? rankedByPercent : rankedByMileage;

  const { selected: selectedMembers, top, bottom, near } = useMemo(
    () => selectMembersForChart(rankedForMode, memId),
    [rankedForMode, memId],
  );

  const selectedIdSet = useMemo(
    () => new Set(selectedMembers.map((item) => item.member.id)),
    [selectedMembers],
  );
  const selectedMemberIdSet = useMemo(
    () => new Set(selectedMembers.map((item) => item.member.id)),
    [selectedMembers],
  );
  const selectedChartData = useMemo(() => {
    const base = mode === "percent" ? percentData : mileageData;
    return base.map((row) => {
      const filtered: DailyPoint = { day: row.day };
      const isFutureInCurrentMonth =
        mode === "mileage" && isCurrentMonth && row.day > dayRef;
      for (const key of Object.keys(row)) {
        if (key === "day" || selectedMemberIdSet.has(key)) {
          filtered[key] = isFutureInCurrentMonth
            ? Number.NaN
            : (row[key] as number | string);
        }
      }
      return filtered;
    });
  }, [mode, percentData, mileageData, selectedMemberIdSet, isCurrentMonth, dayRef]);

  const roleColorMap = useMemo(
    () => buildRoleColorMap(selectedMembers, top, bottom, near, memId),
    [selectedMembers, top, bottom, near, memId],
  );

  const mileageMax = selectedMembers.reduce((max, item) => {
    const memberMax = mileageData.reduce((m, row) => {
      const value = row[item.member.id];
      return typeof value === "number" ? Math.max(m, value) : m;
    }, 0);
    return Math.max(max, memberMax);
  }, 0);
  const mileageTicks =
    mileageMax > 0
      ? Array.from({ length: 5 }, (_, i) => Number(((mileageMax * i) / 4).toFixed(1)))
      : [0, 20, 40, 60, 80];
  const mileageYAxisMax = mileageTicks[mileageTicks.length - 1];
  const memberPercentData: MemberPercentBar[] = rankedByPercent
    .filter((item) => selectedIdSet.has(item.member.id))
    .map((member) => {
      const latestMileage = mileageData[mileageData.length - 1];
      const latest = percentData[percentData.length - 1];
      const currentKmRaw = latestMileage?.[member.member.id];
      const value = latest?.[member.member.id];
      const currentKm = typeof currentKmRaw === "number" ? currentKmRaw : 0;
      const percent = typeof value === "number" ? value : 0;
      return {
        memId: member.member.id,
        name: member.member.name,
        percent,
        barPercent: Number(Math.min(percent, 100).toFixed(1)),
        boosted: percent >= 120,
        currentKm: Number(currentKm.toFixed(1)),
        goalKm: member.member.goalKm ?? 0,
      };
    })
    .sort((a, b) => b.percent - a.percent);

  const statsRows: StatsRow[] = useMemo(
    () => buildStatsRows(rankedForStats, dayRef, totalDays),
    [rankedForStats, dayRef, totalDays],
  );

  const percentBarCount = memberPercentData.length;
  const hasBoostedPercent = memberPercentData.some((item) => item.boosted);
  const percentBarLabelFont =
    percentBarCount > 26 ? 8 : percentBarCount > 18 ? 9 : percentBarCount > 12 ? 10 : 11;
  // 차트 높이는 유지하고, X축 라벨 영역/하단 마진만 줄여 의미 없는 빈 공간을 압축한다.
  const percentBarBottomMargin = percentBarCount > 12 ? 30 : 22;
  const percentBarXAxisHeight = percentBarCount > 12 ? 40 : 36;
  const percentTicks = [0, 20, 40, 60, 80, 100];
  const sortedStatsRows = useMemo(() => {
    const sorted = [...statsRows];
    sorted.sort((a, b) => {
      const lhs = a[statsSortKey];
      const rhs = b[statsSortKey];
      const diff = lhs - rhs;
      return statsSortDir === "asc" ? diff : -diff;
    });
    return sorted;
  }, [statsRows, statsSortDir, statsSortKey]);
  const toggleStatsSort = useCallback((key: StatsSortKey) => {
    setStatsSortKey((prevKey) => {
      if (prevKey === key) {
        setStatsSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
        return prevKey;
      }
      setStatsSortDir(key === "rank" ? "asc" : "desc");
      return key;
    });
  }, []);
  const sortIndicator = useCallback(
    (key: StatsSortKey) =>
      statsSortKey === key ? (statsSortDir === "desc" ? "▼" : "▲") : "",
    [statsSortDir, statsSortKey],
  );
  const getAriaSort = useCallback(
    (key: StatsSortKey): AriaSortValue => {
      if (statsSortKey !== key) return "none";
      return statsSortDir === "asc" ? "ascending" : "descending";
    },
    [statsSortDir, statsSortKey],
  );

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  if (mode === "percent" && percentData.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <SegmentControl
          segments={[
            { value: "mileage", label: "마일리지" },
            { value: "percent", label: "달성률" },
            { value: "stats", label: "전체 통계" },
          ]}
          value={mode}
          onValueChange={(v) => setMode(v as "mileage" | "percent" | "stats")}
        />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  if (selectedChartData.length === 0 || selectedMembers.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl bg-muted">
        <Body className="text-muted-foreground">아직 기록이 없습니다</Body>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 outline-none **:outline-none">
      <SegmentControl
        segments={[
          { value: "mileage", label: "마일리지" },
          { value: "percent", label: "달성률" },
          { value: "stats", label: "전체 통계" },
        ]}
        value={mode}
        onValueChange={(v) => setMode(v as "mileage" | "percent" | "stats")}
      />
      {(refreshing || isPending) && (
        <Body className="text-xs text-muted-foreground" aria-live="polite">
          데이터 동기화 중...
        </Body>
      )}

      {mode === "stats" ? (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="max-h-[52vh] overflow-auto">
            <table className="min-w-[310px] w-full table-fixed border-collapse text-[11px] [font-variant-numeric:tabular-nums]">
              <colgroup>
                <col style={{ width: "60px" }} />
                <col style={{ width: "40px" }} />
                <col style={{ width: "50px" }} />
                <col style={{ width: "55px" }} />
                <col style={{ width: "50px" }} />
              </colgroup>
              <thead className="sticky top-0 z-30 bg-[#F1F3F5]">
                <tr className="border-b bg-[#F1F3F5] text-[10px] text-muted-foreground">
                  <th
                    aria-sort={getAriaSort("rank")}
                    className="sticky left-0 z-40 w-[60px] min-w-[60px] max-w-[60px] bg-[#F1F3F5] px-1 py-1.5 text-center after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-border"
                  >
                    <button
                      type="button"
                      className={`inline-flex w-full items-center justify-center gap-0.5 text-center font-medium leading-none ${
                        statsSortKey === "rank" ? "text-foreground" : ""
                      }`}
                      onClick={() => toggleStatsSort("rank")}
                    >
                      <span>순위</span>
                      <span className="inline-block w-1.5 text-center text-[9px]">{sortIndicator("rank")}</span>
                    </button>
                  </th>
                  <th aria-sort={getAriaSort("goalKm")} className="w-[40px] border-r bg-[#F1F3F5] px-1 py-1.5 text-center">
                    <button
                      type="button"
                      className={`inline-flex w-full items-center justify-center gap-0.5 text-center font-medium leading-none ${
                        statsSortKey === "goalKm" ? "text-foreground" : ""
                      }`}
                      onClick={() => toggleStatsSort("goalKm")}
                    >
                      <span>목표<span className="text-[9px]">(km)</span></span>
                      <span className="inline-block w-1.5 text-center text-[9px]">{sortIndicator("goalKm")}</span>
                    </button>
                  </th>
                  <th aria-sort={getAriaSort("currentKm")} className="w-[50px] border-r bg-[#F1F3F5] px-1 py-1.5 text-center">
                    <button
                      type="button"
                      className={`inline-flex w-full items-center justify-center gap-0.5 text-center font-medium leading-none ${
                        statsSortKey === "currentKm" ? "text-foreground" : ""
                      }`}
                      onClick={() => toggleStatsSort("currentKm")}
                    >
                      <span>누적<span className="text-[9px]">(km)</span></span>
                      <span className="inline-block w-1.5 text-center text-[9px]">{sortIndicator("currentKm")}</span>
                    </button>
                  </th>
                  <th aria-sort={getAriaSort("percent")} className="w-[55px] border-r bg-[#F1F3F5] px-1 py-1.5 text-center">
                    <button
                      type="button"
                      className={`inline-flex w-full items-center justify-center gap-0.5 text-center font-medium leading-none ${
                        statsSortKey === "percent" ? "text-foreground" : ""
                      }`}
                      onClick={() => toggleStatsSort("percent")}
                    >
                      <span>달성률<span className="text-[9px]">(%)</span></span>
                      <span className="inline-block w-1.5 text-center text-[9px]">{sortIndicator("percent")}</span>
                    </button>
                  </th>
                  <th className="w-[50px] bg-[#F1F3F5] px-1 py-1.5 text-center">
                    추천<span className="text-[9px]">(km)</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedStatsRows.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td
                      className={`sticky left-0 z-20 w-[60px] min-w-[60px] max-w-[60px] bg-[#F1F3F5] px-1 py-1 text-center after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-border ${
                        row.name === myName ? "font-semibold text-primary" : ""
                      }`}
                    >
                      <div className="inline-flex items-center justify-center gap-1">
                        <span className="inline-flex min-w-[20px] items-center justify-center text-center">
                          {row.rank <= 3 ? (
                            <span
                              className={
                                row.rank === 1
                                  ? "inline-flex items-center text-amber-500"
                                  : row.rank === 2
                                    ? "inline-flex items-center text-slate-400"
                                    : "inline-flex items-center text-amber-700"
                              }
                              title={`${row.rank}위`}
                            >
                              <Medal className="size-3.5" strokeWidth={2} />
                            </span>
                          ) : (
                            row.rank
                          )}
                        </span>
                        <span className="truncate text-[10px] leading-none">{row.name}</span>
                      </div>
                    </td>
                    <td
                      className={`border-r px-1 py-1.5 text-center whitespace-nowrap ${
                        statsSortKey === "goalKm" ? "bg-muted/25 font-medium" : ""
                      }`}
                    >
                      {row.goalKm.toFixed(0)}
                    </td>
                    <td
                      className={`border-r px-1 py-1.5 text-center whitespace-nowrap ${
                        statsSortKey === "currentKm" ? "bg-muted/25 font-medium" : ""
                      }`}
                    >
                      {row.currentKm.toFixed(1)}
                    </td>
                    <td
                      className={`border-r px-1 py-1.5 text-center whitespace-nowrap ${
                        statsSortKey === "percent" ? "font-semibold" : ""
                      } ${getPercentCellClass(row.percent)}`}
                    >
                      {row.percent.toFixed(1)}%
                      {row.percent >= 120 ? (
                        <span className="ml-1">🚀</span>
                      ) : null}
                    </td>
                    <td className="px-1 py-1.5 text-center whitespace-nowrap">
                      {row.dailyNeed === "done" ? "완료" : Number(row.dailyNeed).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ResponsiveContainer
          width="100%"
          height={mode === "percent" && percentBarCount > 14 ? 256 : 240}
          className="outline-none"
        >
          {mode === "mileage" ? (
            <LineChart
              data={selectedChartData}
              margin={{ top: 2, right: 8, left: 0, bottom: 6 }}
            >
            {isCurrentMonth && dayRef > 0 && (
              <ReferenceLine
                x={dayRef}
                stroke="hsl(var(--primary))"
                strokeOpacity={0.75}
                strokeDasharray="4 4"
                label={{
                  value: "오늘",
                  position: "top",
                  fill: "hsl(var(--primary))",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
            )}
            {mileageTicks.map((tick) => (
              <ReferenceLine
                key={tick}
                y={tick}
                stroke="hsl(var(--border))"
                strokeOpacity={0.65}
              />
            ))}
            <XAxis
              type="number"
              dataKey="day"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              domain={[1, totalDays]}
              allowDataOverflow
              tickFormatter={(d: number) => `${d}일`}
              height={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) => `${v}`}
              width={36}
              ticks={mileageTicks}
              domain={[0, mileageYAxisMax]}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip {...props} myName={myName} mode={mode} />
              )}
            />
            {myGoalKm > 0 && (
              <ReferenceLine
                y={myGoalKm}
                stroke="var(--muted-foreground)"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{
                  value: `목표 ${myGoalKm}`,
                  position: "right",
                  fontSize: 10,
                  fill: "var(--muted-foreground)",
                }}
              />
            )}
            {selectedMembers.map((item) => (
              <Line
                key={item.member.id}
                type="monotone"
                dataKey={item.member.id}
                name={item.member.name}
                stroke={roleColorMap.get(item.member.id) ?? ROLE_COLORS.near[0]}
                dot={false}
                strokeWidth={item.member.name === myName ? 3 : 1.5}
                opacity={item.member.name === myName ? 1 : 0.82}
              />
            ))}
            </LineChart>
          ) : (
            <BarChart
              data={memberPercentData}
              margin={{ top: 4, right: 8, left: 0, bottom: percentBarBottomMargin }}
            >
            {percentTicks.map((tick) => (
              <ReferenceLine
                key={tick}
                y={tick}
                stroke="hsl(var(--border))"
                strokeOpacity={0.65}
              />
            ))}
            <XAxis
              dataKey="name"
              tick={{
                fontSize: percentBarLabelFont,
                fill: "var(--muted-foreground)",
              }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={percentBarXAxisHeight}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) => `${v}%`}
              width={36}
              ticks={percentTicks}
              domain={[0, 100]}
            />
            <Tooltip content={<PercentBarTooltip myName={myName} />} />
            <ReferenceLine
              y={100}
              stroke="var(--muted-foreground)"
              strokeDasharray="6 4"
              strokeWidth={1.5}
            />
            <Bar dataKey="barPercent" radius={[6, 6, 0, 0]}>
              {memberPercentData.map((item) => (
                <Cell
                  key={item.memId}
                  fill={roleColorMap.get(item.memId) ?? ROLE_COLORS.near[0]}
                  fillOpacity={item.name === myName ? 1 : 0.72}
                />
              ))}
            </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}
