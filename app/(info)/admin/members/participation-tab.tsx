"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ArrowDownWideNarrow, ArrowUpNarrowWide, X } from "lucide-react";

import {
  HOT_THRESHOLD,
  PARTICIPATION_DATA_EPOCH,
  RECENT_WINDOW_DAYS,
} from "@/lib/constants/participation";
import { dayjs } from "@/lib/dayjs";

import {
  getParticipationStats,
  type MemberParticipationStat,
  type ParticipationStats,
} from "@/app/actions/admin/get-participation-stats";

import { Avatar } from "@/components/common/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { Caption, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// 참여 탭 — 팀 요약 통계 + 회원별 참여 명단
//
// 인터랙션 규칙(설계안): 사람 수가 적힌 것(카드·온도 세그먼트·미참여 카드)을
// 탭하면 아래 명단이 그 조건으로 필터되고 명단 위에 해제 칩이 붙는다.
// 새 화면·다이얼로그 없음. 예외는 모임당 평균(모임 지표 → 모임 관리로 이동)뿐.
// 행 클릭 → 부모(AdminMembersClient)의 상세 시트를 그대로 연다.
// ---------------------------------------------------------------------------

const KST = "Asia/Seoul";

type Period = "month" | "3m" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  month: "이번 달",
  "3m": "최근 3개월",
  all: "전체",
};

type Temperature = "hot" | "warm" | "cold" | "new";

const TEMP_META: Record<Temperature, { label: string; pillCls: string; dotCls: string }> = {
  hot: { label: "열심", pillCls: "bg-success/10 text-success", dotCls: "bg-success" },
  warm: { label: "보통", pillCls: "bg-primary/10 text-primary", dotCls: "bg-primary" },
  cold: { label: "조용", pillCls: "bg-muted text-muted-foreground", dotCls: "bg-border" },
  new: { label: "신규", pillCls: "border border-border text-muted-foreground", dotCls: "bg-border" },
};

type ListFilter =
  | { key: "participated"; label: string }
  | { key: "upcoming"; label: string }
  | { key: "never"; label: string }
  | { key: "temp"; temp: Temperature; label: string };

export type ParticipationTabMember = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  status: string | null;
  joined_at: string | null;
};

const EMPTY_STAT: Omit<MemberParticipationStat, "memId"> = {
  attendCnt: 0,
  regularCnt: 0,
  hostedCnt: 0,
  compRegCnt: 0,
  attendAllCnt: 0,
  recentAttendCnt: 0,
  upcomingReg: false,
  lastAt: null,
};

function periodRange(period: Period): { from: string; to: string } {
  const now = dayjs().tz(KST);
  const nextMonth = now.add(1, "month").startOf("month").format("YYYY-MM-DD");
  if (period === "month")
    return { from: now.startOf("month").format("YYYY-MM-DD"), to: nextMonth };
  if (period === "3m")
    return {
      from: now.startOf("month").subtract(2, "month").format("YYYY-MM-DD"),
      to: nextMonth,
    };
  return { from: PARTICIPATION_DATA_EPOCH, to: nextMonth };
}

export function ParticipationTab({
  members,
  onSelectMember,
}: {
  members: ParticipationTabMember[];
  onSelectMember: (memId: string) => void;
}) {
  const [period, setPeriod] = useState<Period>("month");
  // 기간별 조회 결과 — stats=null 은 실패. loading/error 는 파생값으로 계산해
  // 이펙트 안 동기 setState(cascading render)를 피한다.
  const [result, setResult] = useState<{
    period: Period;
    stats: ParticipationStats | null;
  } | null>(null);
  const [filter, setFilter] = useState<ListFilter | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // 기간별 결과 캐시 — 이미 본 기간 재선택 시 동일 원시 데이터 재조회를 생략.
  // 키에 실제 날짜 범위를 포함해, 자정/월 경계를 넘긴 뒤 낡은 범위 결과가 재사용되지 않게 한다.
  const cacheRef = useRef(new Map<string, ParticipationStats>());
  const cacheKey = (p: Period) => {
    const { from, to } = periodRange(p);
    return `${p}|${from}|${to}`;
  };

  const stats = result?.period === period ? result.stats : null;
  const loading = result?.period !== period;
  const error = result?.period === period && result.stats === null;

  /** 기간 선택 — 캐시 히트면 이벤트 핸들러에서 즉시 반영(이펙트 내 동기 setState 회피) */
  const selectPeriod = (p: Period) => {
    setPeriod(p);
    const cached = cacheRef.current.get(cacheKey(p));
    if (cached) setResult({ period: p, stats: cached });
  };

  /** 조회 실패 후 재시도 — 실패는 캐시에 없으므로 이펙트가 다시 fetch 한다 */
  const retry = () => {
    setResult(null);
    setRetryTick((t) => t + 1);
  };

  useEffect(() => {
    const key = cacheKey(period);
    if (cacheRef.current.has(key)) return; // 캐시 히트 — selectPeriod에서 이미 반영
    let alive = true;
    const { from, to } = periodRange(period);
    getParticipationStats(from, to).then(
      (res) => {
        if (!alive) return;
        cacheRef.current.set(key, res);
        setResult({ period, stats: res });
      },
      () => {
        if (alive) setResult({ period, stats: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [period, retryTick]);

  const now = dayjs().tz(KST);

  const rows = useMemo(() => {
    const statMap = new Map((stats?.members ?? []).map((s) => [s.memId, s]));
    return members
      .filter((m) => m.status === "active")
      .map((m) => {
        const stat = statMap.get(m.id) ?? { memId: m.id, ...EMPTY_STAT };
        const isNew =
          !!m.joined_at &&
          now.diff(dayjs.tz(m.joined_at, KST), "day") < RECENT_WINDOW_DAYS;
        const temp: Temperature = isNew
          ? "new"
          : stat.recentAttendCnt >= HOT_THRESHOLD
            ? "hot"
            : stat.recentAttendCnt >= 1
              ? "warm"
              : "cold";
        return { member: m, stat, temp };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, stats]);

  const summary = useMemo(() => {
    const activeCnt = rows.length;
    const participated = rows.filter((r) => r.stat.attendCnt > 0).length;
    const tempCnt = { hot: 0, warm: 0, cold: 0, new: 0 };
    for (const r of rows) tempCnt[r.temp] += 1;
    const never = rows.filter((r) => r.stat.attendAllCnt === 0).length;
    // 카드 값과 클릭 시 필터 결과가 같은 모집단(active rows)을 보도록 여기서 파생
    const upcoming = rows.filter((r) => r.stat.upcomingReg).length;
    return { activeCnt, participated, tempCnt, never, upcoming };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (filter?.key === "participated") list = list.filter((r) => r.stat.attendCnt > 0);
    else if (filter?.key === "upcoming") list = list.filter((r) => r.stat.upcomingReg);
    else if (filter?.key === "never") list = list.filter((r) => r.stat.attendAllCnt === 0);
    else if (filter?.key === "temp") list = list.filter((r) => r.temp === filter.temp);
    return [...list].sort((a, b) => {
      const diff = a.stat.attendCnt - b.stat.attendCnt;
      if (diff !== 0) return sortAsc ? diff : -diff;
      return (a.member.full_name ?? "").localeCompare(b.member.full_name ?? "", "ko");
    });
  }, [rows, filter, sortAsc]);

  /** 카드/세그먼트 탭 → 명단 필터 적용 + 명단으로 스크롤 */
  const applyFilter = (next: ListFilter) => {
    setFilter((prev) => {
      const same =
        prev?.key === next.key &&
        (prev?.key !== "temp" || next.key !== "temp" || prev.temp === next.temp);
      return same ? null : next;
    });
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const avgAttend =
    stats && stats.gthrCnt > 0 ? (stats.attendTotal / stats.gthrCnt).toFixed(1) : null;
  const maxMonthly = Math.max(1, ...(stats?.monthly.map((m) => m.attendCnt) ?? [1]));

  return (
    <div className="flex flex-col gap-5">
      {/* 기간 필터 — 모든 요약 카드·명단 수치의 분모 */}
      <div className="flex gap-1.5">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => selectPeriod(p)}
            aria-pressed={period === p}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              period === p
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground"
            }`}
          >
            {PERIOD_LABELS[p]}
            {p === "all" && " (7월~)"}
          </button>
        ))}
      </div>

      {error ? (
        // 기간 셀렉터는 위에 그대로 남아 다른 기간으로 전환하거나 재시도할 수 있다
        <div className="flex flex-col gap-3">
          <EmptyState variant="card" message="통계를 불러오지 못했습니다." />
          <button
            onClick={retry}
            className="self-center rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-primary"
          >
            다시 시도
          </button>
        </div>
      ) : loading || !stats ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          {/* 요약 카드 — 사람 수 카드는 탭하면 명단 필터 */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              value={`${summary.participated}명`}
              label={`${PERIOD_LABELS[period]} 모임 참여 · 활동 ${summary.activeCnt}명 중`}
              className="cursor-pointer transition-transform active:scale-[0.98]"
              onClick={() => applyFilter({ key: "participated", label: "기간 내 참여" })}
            />
            <Link href="/admin/gatherings" className="contents">
              <StatCard
                value={avgAttend ? `${avgAttend}명` : "-"}
                label={`모임당 평균 참석 · ${stats.gthrCnt}회 기준`}
                className="cursor-pointer transition-transform active:scale-[0.98]"
              />
            </Link>
            <StatCard
              value={`${summary.upcoming}명`}
              label="예정 대회 신청"
              className="cursor-pointer transition-transform active:scale-[0.98]"
              onClick={() => applyFilter({ key: "upcoming", label: "예정 대회 신청자" })}
            />
            <StatCard
              value={`${summary.tempCnt.cold}명`}
              label="4주 이상 모임 무참석"
              valueClassName="text-warning"
              className="cursor-pointer transition-transform active:scale-[0.98]"
              onClick={() =>
                applyFilter({ key: "temp", temp: "cold", label: "4주+ 무참석" })
              }
            />
          </div>

          {/* 참여 온도 — 세그먼트 탭 → 해당 온도 필터 */}
          <CardItem className="flex flex-col gap-2.5 p-4">
            <SectionLabel>참여 온도</SectionLabel>
            <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
              {(["hot", "warm", "cold"] as const).map((t) =>
                summary.tempCnt[t] > 0 ? (
                  <button
                    key={t}
                    aria-label={`${TEMP_META[t].label} ${summary.tempCnt[t]}명 필터`}
                    onClick={() =>
                      applyFilter({ key: "temp", temp: t, label: TEMP_META[t].label })
                    }
                    className={TEMP_META[t].dotCls}
                    style={{ flex: summary.tempCnt[t] }}
                  />
                ) : null,
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(["hot", "warm", "cold"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    applyFilter({ key: "temp", temp: t, label: TEMP_META[t].label })
                  }
                  className="flex items-center gap-1.5"
                >
                  <span className={`size-2 rounded-full ${TEMP_META[t].dotCls}`} />
                  <Caption className="text-[12px]">
                    {TEMP_META[t].label}{" "}
                    <span className="font-bold text-foreground tabular-nums">
                      {summary.tempCnt[t]}
                    </span>
                  </Caption>
                </button>
              ))}
            </div>
            <Caption className="text-[11px]">
              열심 4주 {HOT_THRESHOLD}회+ · 보통 1~3회 · 조용 4주+ 무참석 · 신규(가입 4주
              미만) {summary.tempCnt.new}명은 판정 제외
            </Caption>
          </CardItem>

          {/* 월별 참석 연인원 — 최근 6개월 */}
          <CardItem className="flex flex-col gap-2 p-4">
            <SectionLabel>월별 참석 연인원</SectionLabel>
            <div className="flex items-end gap-2 px-1 pt-1">
              {stats.monthly.map((m, i) => {
                const isCurrent = i === stats.monthly.length - 1;
                return (
                  <div
                    key={m.ym}
                    className="flex flex-1 flex-col items-center gap-0.5"
                    title={`${m.label} 참석 ${m.attendCnt}명 · 모임 ${m.gthrCnt}회`}
                  >
                    <span
                      className={`text-[11px] font-bold tabular-nums ${
                        m.attendCnt === 0 ? "text-transparent" : "text-foreground"
                      }`}
                    >
                      {m.attendCnt}
                    </span>
                    {m.attendCnt === 0 ? (
                      <div className="h-[3px] w-full max-w-8 rounded-sm bg-border" />
                    ) : (
                      <div
                        className="w-full max-w-8 rounded-t-[3px] bg-primary"
                        style={{ height: `${6 + (m.attendCnt / maxMonthly) * 44}px` }}
                      />
                    )}
                    <span
                      className={`text-[10px] tabular-nums ${
                        isCurrent
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {m.label}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {m.gthrCnt > 0 ? `${m.gthrCnt}회` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardItem>

          {/* 회원별 참여 명단 */}
          <div ref={listRef} className="flex scroll-mt-16 flex-col gap-3">
            <div className="flex items-center justify-between">
              <SectionLabel>회원별 참여</SectionLabel>
              <button
                onClick={() => setSortAsc((v) => !v)}
                className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[12px] text-muted-foreground"
              >
                {sortAsc ? (
                  <ArrowUpNarrowWide className="size-3" />
                ) : (
                  <ArrowDownWideNarrow className="size-3" />
                )}
                {sortAsc ? "참석 적은순" : "참석 많은순"}
              </button>
            </div>

            {/* 활성 필터 칩 */}
            {filter && (
              <button
                onClick={() => setFilter(null)}
                className="flex w-fit items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background"
              >
                {filter.label} · {filteredRows.length}명
                <X className="size-3" />
              </button>
            )}

            {filteredRows.length === 0 ? (
              <EmptyState variant="card" message="조건에 맞는 회원이 없습니다." />
            ) : (
              <CardItem className="flex flex-col px-4 py-1">
                {filteredRows.map(({ member, stat, temp }) => (
                  <button
                    key={member.id}
                    onClick={() => onSelectMember(member.id)}
                    className="flex items-center gap-3 border-b border-border py-2.5 text-left last:border-b-0"
                  >
                    <Avatar src={member.avatar_url} seed={member.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-foreground">
                        {member.full_name ?? "이름 없음"}
                      </div>
                      <Caption className="text-[11.5px] tabular-nums">
                        모임 {stat.attendCnt} · 정모 {stat.regularCnt} · 대회{" "}
                        {stat.compRegCnt}
                        {stat.hostedCnt > 0 && ` · 개설 ${stat.hostedCnt}`}
                      </Caption>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${TEMP_META[temp].pillCls}`}
                      >
                        {TEMP_META[temp].label}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {stat.lastAt ? dayjs(stat.lastAt).tz(KST).format("M.D") : "—"}
                      </span>
                    </div>
                  </button>
                ))}
              </CardItem>
            )}
          </div>

          {/* 액션 리스트 — 가입 후 모임 미참여 */}
          {summary.never > 0 && (
            <button
              onClick={() => applyFilter({ key: "never", label: "가입 후 미참여" })}
              className="flex items-center gap-2.5 rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-left"
            >
              <span className="text-[14px] text-warning">⚠</span>
              <span className="flex-1 text-[13px] text-foreground">
                가입 후 모임 참여가 없는 회원{" "}
                <b className="font-bold tabular-nums">{summary.never}명</b>
              </span>
              <span className="text-muted-foreground">›</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
