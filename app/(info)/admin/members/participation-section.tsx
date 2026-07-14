"use client";

import { useEffect, useMemo, useState } from "react";

import {
  INACTIVE_WARN_DAYS,
  MONTHLY_WINDOW,
} from "@/lib/constants/participation";
import { dayjs, recentMonthBucketsKST, secondsToTime } from "@/lib/dayjs";
import { createClient } from "@/lib/supabase/client";

import { EmptyState } from "@/components/common/empty-state";
import { Caption, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// 회원 상세 시트 — 참여 현황 섹션
//
// 서버 액션 없이 브라우저 클라이언트로 직접 조회한다. RLS가 이미 팀 멤버에게
// 조회를 허용하기 때문(gthr_attd_rel_select / comp_reg_rel_select_teammate /
// rec_race_hist_select_public). KNOWLEDGE.md "관리자가 타 회원 온보딩 프로필을
// 볼 때 서버 액션이 필요 없다" 항목과 같은 원칙.
//
// 색 규칙(설계안): 모임 계열 = primary(파랑), 대회 계열 = sport-road-run(주황).
// "대회 신청"과 "완주 기록"은 다른 사실이므로 합산하지 않는다.
// ---------------------------------------------------------------------------

const KST = "Asia/Seoul";
/** 타임라인 기본 표시 건수 ("전체 보기"로 확장) */
const TIMELINE_PREVIEW_COUNT = 4;

type GthrAttdRow = {
  gthr_id: string;
  gthr_mst: {
    gthr_nm: string;
    stt_at: string;
    gthr_type_enm: string;
    crt_by: string | null;
  };
};

type CompRegRow = {
  comp_reg_id: string;
  crt_at: string;
  comp_evt_cfg: { comp_evt_type: string } | null;
  team_comp_plan_rel: {
    comp_mst: { comp_nm: string; stt_dt: string } | null;
  };
};

type RaceRow = {
  race_result_id: string;
  race_nm: string | null;
  race_dt: string;
  rec_time_sec: number | null;
};

type TimelineItem = {
  id: string;
  kind: "gthr" | "comp" | "rec";
  /** 정렬·표시 기준 시각 (모임=모임 시작, 대회=신청 시각, 기록=대회일) */
  date: string;
  label: string;
  hosted?: boolean;
  future?: boolean;
};

type Participation = {
  attendCnt: number;
  regularCnt: number;
  hostedCnt: number;
  compRegCnt: number;
  raceRecCnt: number;
  /** 최근 6개월 월별 참석 수 (과거 오래된 달 → 이번 달 순) */
  monthly: { ym: string; label: string; count: number }[];
  timeline: TimelineItem[];
  /** 마지막 참여(모임 참석·완주 기록) 시점. 신청은 몸으로 한 참여가 아니라 제외 */
  lastAt: string | null;
};

/** 값 강조형 미니 pill — 모임(파랑)/대회(주황) 계열 색 고정 */
function CountPill({
  tone,
  label,
  value,
}: {
  tone: "gthr" | "comp";
  label: string;
  value: number;
}) {
  const toneCls =
    tone === "gthr"
      ? "bg-primary/10 text-primary"
      : "bg-sport-road-run/10 text-sport-road-run";
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-md px-2 py-1 ${toneCls}`}>
      <span className="text-[11px]">{label}</span>
      <span className="text-[13px] font-bold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

/** 타임라인 종류 뱃지 */
function KindBadge({ kind }: { kind: TimelineItem["kind"] }) {
  const cls =
    kind === "gthr"
      ? "bg-primary/10 text-primary"
      : "bg-sport-road-run/10 text-sport-road-run";
  const text = kind === "gthr" ? "모임" : kind === "comp" ? "대회" : "기록";
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
      {text}
    </span>
  );
}

export function ParticipationSection({
  memId,
  teamId,
}: {
  memId: string;
  teamId: string;
}) {
  const [data, setData] = useState<Participation | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // memId별 remount(호출부 key)라 loading 초기값(true)이 그대로 적용된다.
    let alive = true;
    const supabase = createClient();

    Promise.all([
      // 1) 모임 참석 (팀 스코프는 gthr_mst 임베드 필터로)
      supabase
        .from("gthr_attd_rel")
        .select(
          "gthr_id, gthr_mst!inner(gthr_nm, stt_at, gthr_type_enm, crt_by, team_id, del_yn)",
        )
        .eq("mem_id", memId)
        .eq("gthr_mst.team_id", teamId)
        .eq("gthr_mst.del_yn", false),
      // 2) 개설 수 (참석 여부 무관 — get_member_monthly_activity의 hosted_cnt와 동일 기준)
      supabase
        .from("gthr_mst")
        .select("gthr_id", { count: "exact", head: true })
        .eq("crt_by", memId)
        .eq("team_id", teamId)
        .eq("del_yn", false),
      // 3) 팀 대회 신청
      supabase
        .from("comp_reg_rel")
        .select(
          "comp_reg_id, crt_at, comp_evt_cfg(comp_evt_type), team_comp_plan_rel!inner(team_id, del_yn, comp_mst!inner(comp_nm, stt_dt))",
        )
        .eq("mem_id", memId)
        .eq("vers", 0)
        .eq("del_yn", false)
        .eq("team_comp_plan_rel.team_id", teamId)
        .eq("team_comp_plan_rel.del_yn", false),
      // 4) 대회 완주 기록 (수기 기록 포함)
      supabase
        .from("rec_race_hist")
        .select("race_result_id, race_nm, race_dt, rec_time_sec")
        .eq("mem_id", memId)
        .eq("vers", 0)
        .eq("del_yn", false)
        .order("race_dt", { ascending: false }),
    ]).then(
      ([attdRes, hostedRes, regRes, raceRes]) => {
        if (!alive) return;
        // supabase 쿼리는 실패해도 reject 대신 { error }로 resolve — 무시하면
        // "참여 기록 없음"으로 오인 표시되므로 명시적으로 에러 상태를 켠다.
        if (attdRes.error || hostedRes.error || regRes.error || raceRes.error) {
          setFailed(true);
          setLoading(false);
          return;
        }
        const attends = (attdRes.data ?? []) as unknown as GthrAttdRow[];
        const regs = (regRes.data ?? []) as unknown as CompRegRow[];
        const races = (raceRes.data ?? []) as RaceRow[];

        const now = dayjs().tz(KST);
        const pastAttends = attends.filter((a) =>
          dayjs(a.gthr_mst.stt_at).isBefore(now),
        );
        // 미래 날짜 수기 기록은 아직 "완주"가 아님 — 카운트·마지막 참여에서 제외
        const pastRaces = races.filter(
          (r) => !dayjs.tz(r.race_dt, KST).isAfter(now),
        );

        const monthly = recentMonthBucketsKST(MONTHLY_WINDOW).map((m) => ({
          ...m,
          count: 0,
        }));
        const bucket = new Map(monthly.map((m) => [m.ym, m]));
        for (const a of pastAttends) {
          const ym = dayjs(a.gthr_mst.stt_at).tz(KST).format("YYYY-MM");
          const b = bucket.get(ym);
          if (b) b.count += 1;
        }

        const timeline: TimelineItem[] = [
          ...attends.map((a): TimelineItem => ({
            id: `g-${a.gthr_id}`,
            kind: "gthr",
            date: a.gthr_mst.stt_at,
            label: a.gthr_mst.gthr_nm,
            hosted: a.gthr_mst.crt_by === memId,
            future: dayjs(a.gthr_mst.stt_at).isAfter(now),
          })),
          ...regs.map((r): TimelineItem => ({
            id: `c-${r.comp_reg_id}`,
            kind: "comp",
            date: r.crt_at,
            label: `${r.team_comp_plan_rel.comp_mst?.comp_nm ?? "대회"} 신청${
              r.comp_evt_cfg?.comp_evt_type ? ` · ${r.comp_evt_cfg.comp_evt_type}` : ""
            }`,
          })),
          ...races.map((r): TimelineItem => {
            const dt = dayjs.tz(r.race_dt, KST); // date 컬럼 → KST 자정 앵커로 정규화
            return {
              id: `r-${r.race_result_id}`,
              kind: "rec",
              date: dt.toISOString(),
              label: `${r.race_nm ?? "대회 기록"}${
                r.rec_time_sec != null ? ` · ${secondsToTime(r.rec_time_sec)}` : ""
              }`,
              future: dt.isAfter(now),
            };
          }),
        ].sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

        const lastCandidates = [
          ...pastAttends.map((a) => a.gthr_mst.stt_at),
          ...pastRaces.map((r) => dayjs.tz(r.race_dt, KST).toISOString()),
        ].sort((a, b) => dayjs(b).valueOf() - dayjs(a).valueOf());

        setData({
          attendCnt: pastAttends.length,
          regularCnt: pastAttends.filter((a) => a.gthr_mst.gthr_type_enm === "regular")
            .length,
          hostedCnt: hostedRes.count ?? 0,
          compRegCnt: regs.length,
          raceRecCnt: pastRaces.length,
          monthly,
          timeline,
          lastAt: lastCandidates[0] ?? null,
        });
        setLoading(false);
      },
      // 네트워크 실패 등으로 reject 되면 스켈레톤이 영영 안 걷히므로 로딩만 해제
      () => {
        if (!alive) return;
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [memId, teamId]);

  const maxMonthly = useMemo(
    () => Math.max(1, ...(data?.monthly.map((m) => m.count) ?? [1])),
    [data],
  );

  const isEmpty =
    data &&
    data.attendCnt === 0 &&
    data.hostedCnt === 0 &&
    data.compRegCnt === 0 &&
    data.raceRecCnt === 0 &&
    data.timeline.length === 0;

  const daysSinceLast = data?.lastAt
    ? dayjs().tz(KST).startOf("day").diff(dayjs(data.lastAt).tz(KST).startOf("day"), "day")
    : null;

  const visibleTimeline = expanded
    ? data?.timeline
    : data?.timeline.slice(0, TIMELINE_PREVIEW_COUNT);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <SectionLabel>참여 현황</SectionLabel>
        {/* 참여 탭(기간 필터)과 달리 시트는 전체 기간 집계 — 기준을 명시해 혼동 방지 */}
        <Caption className="text-[11px]">전체 기간</Caption>
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full rounded-2xl" />
      ) : failed ? (
        <EmptyState variant="inline" message="참여 정보를 불러오지 못했습니다" />
      ) : !data || isEmpty ? (
        <EmptyState variant="inline" message="참여 기록 없음" />
      ) : (
        <CardItem className="flex flex-col gap-3.5 p-3.5">
          {/* 요약 pill — 모임 계열(파랑) / 대회 계열(주황) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5">
              <CountPill tone="gthr" label="모임 참석" value={data.attendCnt} />
              <CountPill tone="gthr" label="정모" value={data.regularCnt} />
              <CountPill tone="gthr" label="개설" value={data.hostedCnt} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <CountPill tone="comp" label="대회 신청" value={data.compRegCnt} />
              <CountPill tone="comp" label="완주 기록" value={data.raceRecCnt} />
            </div>
          </div>

          {/* 월별 참석 — 최근 6개월 미니 바 */}
          <div className="flex flex-col gap-1">
            <Caption className="text-[11px]">월별 참석 · 최근 6개월</Caption>
            <div className="flex items-end gap-2 px-1 pt-1">
              {data.monthly.map((m, i) => {
                const isCurrent = i === data.monthly.length - 1;
                return (
                  <div
                    key={m.ym}
                    className="flex flex-1 flex-col items-center gap-0.5"
                    title={`${m.label} ${m.count}회`}
                  >
                    {isCurrent && (
                      <span className="text-[11px] font-bold tabular-nums text-foreground">
                        {m.count}
                      </span>
                    )}
                    {m.count === 0 ? (
                      <div className="h-[3px] w-full max-w-6 rounded-sm bg-border" />
                    ) : (
                      <div
                        className="w-full max-w-6 rounded-t-[3px] bg-primary"
                        style={{ height: `${6 + (m.count / maxMonthly) * 30}px` }}
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
                  </div>
                );
              })}
            </div>
          </div>

          {/* 최근 활동 타임라인 */}
          {data.timeline.length > 0 && (
            <div className="flex flex-col">
              <Caption className="text-[11px]">최근 활동</Caption>
              {visibleTimeline?.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 border-b border-border py-2 last:border-b-0 ${
                    t.future ? "opacity-55" : ""
                  }`}
                >
                  <KindBadge kind={t.kind} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {t.label}
                    {t.hosted && (
                      <span className="text-muted-foreground"> · 개설</span>
                    )}
                    {t.future && (
                      <span className="text-muted-foreground"> · 예정</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {dayjs(t.date).tz(KST).format("M.D")}
                  </span>
                </div>
              ))}
              {data.timeline.length > TIMELINE_PREVIEW_COUNT && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="pt-2 text-center text-[12px] font-semibold text-primary"
                >
                  {expanded ? "접기" : `전체 활동 보기 (${data.timeline.length})`}
                </button>
              )}
            </div>
          )}

          {/* 마지막 참여 — 4주 이상 무참여면 이탈 신호로 경고색 */}
          {daysSinceLast != null && (
            <div className="flex items-center gap-1.5">
              <span
                className={`size-1.5 rounded-full ${
                  daysSinceLast >= INACTIVE_WARN_DAYS ? "bg-warning" : "bg-success"
                }`}
              />
              <Caption
                className={`text-[12px] ${
                  daysSinceLast >= INACTIVE_WARN_DAYS ? "text-warning" : ""
                }`}
              >
                {daysSinceLast >= INACTIVE_WARN_DAYS
                  ? `${Math.floor(daysSinceLast / 7)}주째 참여 없음`
                  : daysSinceLast === 0
                    ? "오늘 참여함"
                    : `마지막 참여 ${daysSinceLast}일 전`}
              </Caption>
            </div>
          )}
        </CardItem>
      )}
    </div>
  );
}
