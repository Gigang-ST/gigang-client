"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { todayKST, currentMonthKST, daysInMonth } from "@/lib/dayjs";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
dayjs.extend(utc);
dayjs.extend(timezone);
import { createClient } from "@/lib/supabase/client";
import { compEvtTypeContainsHangul } from "@/lib/comp-evt-type";
import { getOrCreateCompEvtIdForParticipation } from "@/app/actions/get-or-create-comp-evt-for-participation";
import { revalidateCompetitions } from "@/app/actions/revalidate-competitions";
import { ensureTeamCompPlanRel } from "@/lib/queries/ensure-team-comp-plan-rel";
import { Micro, SectionLabel } from "@/components/common/typography";
import { CompetitionDetailDialog } from "@/components/races/competition-detail-dialog";
import { cn } from "@/lib/utils";
import type { Competition, CompetitionRegistration, MemberStatus } from "@/components/races/types";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";

export type CalendarRace = {
  id: string;
  title: string;
  start_date: string;
  type: "gigang" | "mine";
};

type MiniCalendarProps = {
  gigangRaces: CalendarRace[];
  myRaces: CalendarRace[];
  teamId: string;
  memberId?: string;
  cmmCdRows: CachedCmmCdRow[];
  initialMemberStatus: MemberStatus;
  initialRegistrationsByCompetitionId: Record<string, CompetitionRegistration>;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function monthLastDayStr(year: number, month: number): string {
  const d = daysInMonth(year, month);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function MiniCalendar({
  gigangRaces: initGigang,
  myRaces: initMine,
  teamId,
  memberId,
  cmmCdRows,
  initialMemberStatus,
  initialRegistrationsByCompetitionId,
}: MiniCalendarProps) {
  const supabase = useMemo(() => createClient(), []);
  const initialMonth = currentMonthKST();
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [gigangRaces, setGigangRaces] = useState(initGigang);
  const [myRaces, setMyRaces] = useState(initMine);
  const [isPending, startTransition] = useTransition();

  const [selectedDate, setSelectedDate] = useState<string>(() => todayKST());
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [registrationsByCompetitionId, setRegistrationsByCompetitionId] =
    useState<Record<string, CompetitionRegistration>>(initialRegistrationsByCompetitionId);

  const memberStatus = initialMemberStatus;

  const today = todayKST();
  const [yearStr, monthStr] = viewMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const totalDays = daysInMonth(year, month);
  const firstDayOfWeek = dayjs.tz(`${year}-${String(month).padStart(2, "0")}-01`, "Asia/Seoul").day();

  // 날짜별 이벤트 목록 (mine 우선, 중복 제거)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarRace[]>();
    const allRaces = [...myRaces, ...gigangRaces];
    const seen = new Set<string>();
    for (const race of allRaces) {
      const key = `${race.start_date}:${race.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const list = map.get(race.start_date) ?? [];
      list.push(race);
      map.set(race.start_date, list);
    }
    return map;
  }, [gigangRaces, myRaces]);

  // 주차별로 날짜 그룹핑
  const weeks = useMemo(() => {
    const cells: (number | null)[] = [
      ...Array.from<null>({ length: firstDayOfWeek }).fill(null),
      ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    const result: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      result.push(cells.slice(i, i + 7).concat(Array(7).fill(null)).slice(0, 7));
    }
    return result;
  }, [firstDayOfWeek, totalDays]);

  function formatCellDate(day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  async function handleRaceClick(race: CalendarRace) {
    const { data } = await supabase
      .from("comp_mst")
      .select("comp_id, comp_nm, comp_sprt_cd, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_type)")
      .eq("comp_id", race.id)
      .single();

    const comp: Competition = data
      ? {
          id: data.comp_id,
          external_id: "",
          sport: data.comp_sprt_cd ?? null,
          title: data.comp_nm,
          start_date: data.stt_dt,
          end_date: data.end_dt ?? null,
          location: data.loc_nm ?? null,
          event_types: (data.comp_evt_cfg as { comp_evt_type: string | null }[])
            .map((e) => e.comp_evt_type?.toUpperCase())
            .filter((e): e is string => Boolean(e)),
          source_url: data.src_url ?? null,
        }
      : {
          id: race.id,
          external_id: "",
          sport: null,
          title: race.title,
          start_date: race.start_date,
          end_date: null,
          location: null,
          event_types: null,
          source_url: null,
        };

    setSelectedCompetition(comp);
    setDetailOpen(true);
  }

  const createRegistration = async (
    competitionId: string,
    payload: { role: "participant" | "cheering" | "volunteer"; eventType: string },
  ) => {
    if (memberStatus.status !== "ready") return { ok: false as const, message: "로그인이 필요합니다." };
    const eventType = payload.role === "participant" ? payload.eventType.trim().toUpperCase() : null;
    if (payload.role === "participant" && eventType && compEvtTypeContainsHangul(eventType))
      return { ok: false as const, message: "종목은 한글을 사용할 수 없습니다. 영문·숫자로 입력해 주세요." };

    const ensured = await ensureTeamCompPlanRel(supabase, teamId, competitionId);
    if (!ensured.ok) return { ok: false as const, message: "신청에 실패했습니다." };

    let compEvtId: string | null = null;
    if (payload.role === "participant") {
      if (!eventType) return { ok: false as const, message: "참가 종목을 선택해 주세요." };
      const resolved = await getOrCreateCompEvtIdForParticipation(competitionId, eventType);
      if (!resolved.ok) return { ok: false as const, message: resolved.message };
      compEvtId = resolved.compEvtId;
    }

    const { data, error } = await supabase
      .from("comp_reg_rel")
      .insert({ team_comp_id: ensured.teamCompId, mem_id: memberStatus.memberId, prt_role_cd: payload.role, comp_evt_id: compEvtId, vers: 0, del_yn: false })
      .select("comp_reg_id, mem_id, prt_role_cd, crt_at")
      .single();
    if (error) return { ok: false as const, message: "신청에 실패했습니다." };
    setRegistrationsByCompetitionId((prev) => ({
      ...prev,
      [competitionId]: { id: data.comp_reg_id, competition_id: competitionId, member_id: data.mem_id, role: data.prt_role_cd as "participant" | "cheering" | "volunteer", event_type: eventType, created_at: data.crt_at },
    }));
    return { ok: true as const, message: "참가 신청 완료" };
  };

  const updateRegistration = async (
    registrationId: string,
    competitionId: string,
    payload: { role: "participant" | "cheering" | "volunteer"; eventType: string },
  ) => {
    if (memberStatus.status !== "ready") return { ok: false as const, message: "로그인이 필요합니다." };
    const eventType = payload.role === "participant" ? payload.eventType.trim().toUpperCase() : null;
    if (payload.role === "participant" && eventType && compEvtTypeContainsHangul(eventType))
      return { ok: false as const, message: "종목은 한글을 사용할 수 없습니다. 영문·숫자로 입력해 주세요." };

    let compEvtId: string | null = null;
    if (payload.role === "participant") {
      if (!eventType) return { ok: false as const, message: "참가 종목을 선택해 주세요." };
      const resolved = await getOrCreateCompEvtIdForParticipation(competitionId, eventType);
      if (!resolved.ok) return { ok: false as const, message: resolved.message };
      compEvtId = resolved.compEvtId;
    }

    const { data, error } = await supabase
      .from("comp_reg_rel")
      .update({ prt_role_cd: payload.role, comp_evt_id: compEvtId })
      .eq("comp_reg_id", registrationId)
      .select("comp_reg_id, mem_id, prt_role_cd, crt_at")
      .single();
    if (error) return { ok: false as const, message: "수정에 실패했습니다." };
    setRegistrationsByCompetitionId((prev) => ({
      ...prev,
      [competitionId]: { id: data.comp_reg_id, competition_id: competitionId, member_id: data.mem_id, role: data.prt_role_cd as "participant" | "cheering" | "volunteer", event_type: eventType, created_at: data.crt_at },
    }));
    return { ok: true as const, message: "업데이트 완료" };
  };

  const deleteRegistration = async (registrationId: string, competitionId: string) => {
    const { error } = await supabase.from("comp_reg_rel").delete().eq("comp_reg_id", registrationId);
    if (error) return { ok: false as const, message: "취소에 실패했습니다." };
    setRegistrationsByCompetitionId((prev) => {
      const next = { ...prev };
      delete next[competitionId];
      return next;
    });
    return { ok: true as const, message: "취소 완료" };
  };

  async function fetchMonthData(newMonth: string) {
    const [yStr, mStr] = newMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const lastDay = monthLastDayStr(y, m);

    const { data: teamComps } = await supabase.rpc("get_public_team_competitions", {
      p_team_id: teamId,
      p_start: newMonth,
      p_end: lastDay,
    });

    const seenIds = new Set<string>();
    const newGigang: CalendarRace[] = (teamComps ?? [])
      .filter((row) => (row.reg_count ?? 0) > 0)
      .filter((row) => { if (seenIds.has(row.comp_id)) return false; seenIds.add(row.comp_id); return true; })
      .map((row) => ({ id: row.comp_id, title: row.comp_nm, start_date: row.stt_dt, type: "gigang" as const }));

    let newMine: CalendarRace[] = [];
    if (memberId) {
      const { data: myRegs } = await supabase
        .from("comp_reg_rel")
        .select("team_comp_plan_rel!inner(comp_id, comp_mst!inner(comp_id, comp_nm, stt_dt))")
        .eq("mem_id", memberId)
        .eq("team_comp_plan_rel.team_id", teamId)
        .eq("vers", 0)
        .eq("del_yn", false);

      newMine = (myRegs ?? []).flatMap((r) => {
        const plan = Array.isArray(r.team_comp_plan_rel) ? r.team_comp_plan_rel[0] : r.team_comp_plan_rel;
        const comp = Array.isArray(plan?.comp_mst) ? plan.comp_mst[0] : plan?.comp_mst;
        if (!comp) return [];
        const race: CalendarRace = { id: comp.comp_id, title: comp.comp_nm, start_date: comp.stt_dt, type: "mine" };
        return race.start_date >= newMonth && race.start_date <= lastDay ? [race] : [];
      });
    }

    return { gigang: newGigang, mine: newMine };
  }

  function navigate(dir: -1 | 1) {
    startTransition(async () => {
      const d = new Date(`${viewMonth}`);
      d.setMonth(d.getMonth() + dir);
      const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const { gigang, mine } = await fetchMonthData(newMonth);
      setViewMonth(newMonth);
      setGigangRaces(gigang);
      setMyRaces(mine);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <SectionLabel>SCHEDULE</SectionLabel>
        <div className="flex items-center gap-1">
          <Micro className="font-medium tabular-nums text-foreground">
            {year}.{String(month).padStart(2, "0")}
          </Micro>
          <button
            onClick={() => navigate(-1)}
            disabled={isPending}
            className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
            aria-label="이전 달"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            onClick={() => navigate(1)}
            disabled={isPending}
            className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
            aria-label="다음 달"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 달력 + 이벤트 */}
      <div className={cn("flex flex-col transition-opacity", isPending && "opacity-50")}>
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((wd) => (
            <Micro
              key={wd}
              className={cn(
                "pb-1",
                wd === "일" && "text-destructive",
                wd === "토" && "text-primary",
              )}
            >
              {wd}
            </Micro>
          ))}
        </div>

        {/* 바둑판 그리드 — 셀 고정 높이 */}
        <div className="grid grid-cols-7">
          {weeks.flat().map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="h-20 border-t border-border/40" />;
            }
            const dateStr = formatCellDate(day);
            const isToday = dateStr === today;
            const isSelected = selectedDate === dateStr;
            const colIndex = idx % 7;
            const races = eventsByDate.get(dateStr) ?? [];

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={cn(
                  "flex h-20 flex-col gap-px border-t border-border/40 px-0.5 pt-1 text-left transition-colors",
                  isSelected && "bg-secondary/60",
                )}
                aria-pressed={isSelected}
              >
                {/* 날짜 숫자 */}
                <div className="flex justify-center pb-px">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-[12px] font-medium",
                      isToday && "bg-primary text-primary-foreground font-bold",
                      !isToday && colIndex === 0 && "text-destructive",
                      !isToday && colIndex === 6 && "text-primary",
                      !isToday && colIndex !== 0 && colIndex !== 6 && "text-foreground",
                    )}
                  >
                    {day}
                  </span>
                </div>

                {/* 이벤트 목록 — 최대 3개, 나머지는 +N */}
                <div className="flex flex-col gap-px overflow-hidden">
                  {races.slice(0, 3).map((race) => (
                    <span
                      key={race.id}
                      className={cn(
                        "w-full truncate rounded-sm px-0.5 text-left text-[7px] font-medium leading-[1.5]",
                        race.type === "mine"
                          ? "bg-success/20 text-success"
                          : "bg-warning/15 text-warning",
                      )}
                    >
                      {race.title}
                    </span>
                  ))}
                  {races.length > 3 && (
                    <span className="px-0.5 text-[9px] text-muted-foreground">
                      +{races.length - 3}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 날짜 패널 — 항상 표시, 클릭으로 날짜 변경 */}
      {(() => {
        const panelRaces = eventsByDate.get(selectedDate) ?? [];
        const [, mm, dd] = selectedDate.split("-");
        return (
          <div className="mt-1 flex items-center gap-3 rounded-xl bg-secondary/50 px-3 py-2">
            <div className="flex items-baseline gap-1 shrink-0">
              <span className="text-[18px] font-bold leading-none text-foreground tabular-nums">
                {parseInt(dd, 10)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {parseInt(mm, 10)}월
              </span>
            </div>
            {panelRaces.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">일정 없음</span>
            ) : (
              <div className="flex flex-col gap-1">
                {panelRaces.map((race) => (
                  <button
                    key={race.id}
                    onClick={() => handleRaceClick(race)}
                    className="flex items-center gap-1.5 text-left transition-opacity hover:opacity-70"
                  >
                    <span
                      className={cn(
                        "h-3 w-0.5 shrink-0 rounded-full",
                        race.type === "mine" ? "bg-success" : "bg-warning",
                      )}
                    />
                    <span className="text-[11px] font-medium text-foreground">{race.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* 대회 상세 다이얼로그 */}
      <CompetitionDetailDialog
        cmmCdRows={cmmCdRows}
        teamId={teamId}
        competition={selectedCompetition}
        registration={selectedCompetition ? registrationsByCompetitionId[selectedCompetition.id] : undefined}
        memberStatus={memberStatus}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCreate={createRegistration}
        onUpdate={updateRegistration}
        onDelete={deleteRegistration}
        onCompetitionUpdated={async () => {
          await revalidateCompetitions();
          window.location.reload();
        }}
      />
    </div>
  );
}
