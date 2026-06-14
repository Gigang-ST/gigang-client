"use client";

import { useMemo, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";

import { compEvtTypeContainsHangul } from "@/lib/comp-evt-type";
import { dayjs, todayKST, currentMonthKST, daysInMonth } from "@/lib/dayjs";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";
import { ensureTeamCompPlanRel } from "@/lib/queries/ensure-team-comp-plan-rel";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { getOrCreateCompEvtIdForParticipation } from "@/app/actions/get-or-create-comp-evt-for-participation";
import { revalidateCompetitions } from "@/app/actions/revalidate-competitions";


import { Micro, SectionLabel } from "@/components/common/typography";
import { AddScheduleDropdown } from "@/components/home/add-schedule-dropdown";
import { CompetitionPickerDialog } from "@/components/home/competition-picker-dialog";
import { ScheduleListView } from "@/components/home/schedule-list-view";
import { CompetitionDetailDialog } from "@/components/races/competition-detail-dialog";
import type { Competition, CompetitionRegistration, MemberStatus } from "@/components/races/types";
import { SchPostFormDialog } from "@/components/schedule/sch-post-form-dialog";
import { schPostTypeInlineLabel } from "@/lib/validations/schedule";
import type { SchPostType } from "@/lib/validations/schedule";




export type CalendarRace = {
  id: string;
  title: string;
  start_date: string;
  type: "gigang" | "mine" | "schedule";
  // 공통 선택 필드
  end_date?: string | null;
  location?: string | null;
  regCount?: number;
  // schedule 전용
  url?: string | null;
  cont_txt?: string | null;
  crt_by?: string;
  post_type?: string | null;
  // 시간 표시용 (원본 일시 문자열)
  evt_stt_at?: string | null;
  evt_end_at?: string | null;
};

type MiniCalendarProps = {
  gigangRaces: CalendarRace[];
  myRaces: CalendarRace[];
  schPosts: CalendarRace[];
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
  schPosts: initSchPosts,
  teamId,
  memberId,
  cmmCdRows,
  initialMemberStatus,
  initialRegistrationsByCompetitionId,
}: MiniCalendarProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const initialMonth = currentMonthKST();
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [gigangRaces, setGigangRaces] = useState(initGigang);
  const [myRaces, setMyRaces] = useState(initMine);
  const [schPosts, setSchPosts] = useState(initSchPosts);
  const [isPending, startTransition] = useTransition();

  // 일정 폼 다이얼로그 상태
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | "view">("create");
  const [formPostType, setFormPostType] = useState<SchPostType>("general");
  const [editTarget, setEditTarget] = useState<CalendarRace | null>(null);

  // 대회 선택 다이얼로그 상태
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDefaultDate, setPickerDefaultDate] = useState<string | undefined>(undefined);

  const [view, setView] = useState<"calendar" | "list">("calendar");
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

  // 날짜별 이벤트 목록 (mine 우선, schedule, gigang 순)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarRace[]>();
    const allRaces = [...myRaces, ...schPosts, ...gigangRaces];
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
  }, [gigangRaces, myRaces, schPosts]);

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
    handleSchPostSuccess();
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
    handleSchPostSuccess();
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
    handleSchPostSuccess();
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
      .map((row) => ({ id: row.comp_id, title: row.comp_nm, start_date: row.stt_dt, type: "gigang" as const, location: row.loc_nm ?? null, regCount: row.reg_count ?? 0 }));

    let newMine: CalendarRace[] = [];
    if (memberId) {
      const { data: myRegs } = await supabase
        .from("comp_reg_rel")
        .select("team_comp_plan_rel!inner(comp_id, comp_mst!inner(comp_id, comp_nm, stt_dt, loc_nm))")
        .eq("mem_id", memberId)
        .eq("team_comp_plan_rel.team_id", teamId)
        .eq("vers", 0)
        .eq("del_yn", false);

      const regCountMap = new Map<string, number>(
        (teamComps ?? []).map((row) => [row.comp_id, row.reg_count ?? 0]),
      );

      newMine = (myRegs ?? []).flatMap((r) => {
        const plan = Array.isArray(r.team_comp_plan_rel) ? r.team_comp_plan_rel[0] : r.team_comp_plan_rel;
        const comp = Array.isArray(plan?.comp_mst) ? plan.comp_mst[0] : plan?.comp_mst;
        if (!comp) return [];
        const race: CalendarRace = { id: comp.comp_id, title: comp.comp_nm, start_date: comp.stt_dt, type: "mine", location: comp.loc_nm ?? null, regCount: regCountMap.get(comp.comp_id) ?? 0 };
        return race.start_date >= newMonth && race.start_date <= lastDay ? [race] : [];
      });
    }

    // sch_post 조회
    const { data: schPostRows } = await supabase
      .from("sch_post")
      .select("sch_post_id, sch_nm, post_type, evt_stt_at, evt_end_at, url, cont_txt, crt_by")
      .eq("team_id", teamId)
      .gte("evt_stt_at", newMonth)
      .lte("evt_stt_at", lastDay)
      .eq("del_yn", false)
      .order("evt_stt_at", { ascending: true });

    const newSchPosts: CalendarRace[] = (schPostRows ?? []).map((row) => ({
      id: row.sch_post_id,
      title: row.sch_nm,
      start_date: dayjs(row.evt_stt_at).format("YYYY-MM-DD"),
      type: "schedule" as const,
      end_date: row.evt_end_at,
      evt_stt_at: row.evt_stt_at,
      evt_end_at: row.evt_end_at,
      url: row.url,
      cont_txt: row.cont_txt,
      crt_by: row.crt_by,
      post_type: row.post_type,
    }));

    return { gigang: newGigang, mine: newMine, schPosts: newSchPosts };
  }

  function navigate(dir: -1 | 1) {
    startTransition(async () => {
      const newMonthDayjs = dayjs(viewMonth).add(dir, "month");
      const newMonth = newMonthDayjs.format("YYYY-MM-01");
      const { gigang, mine, schPosts: newSch } = await fetchMonthData(newMonth);
      setViewMonth(newMonth);
      setGigangRaces(gigang);
      setMyRaces(mine);
      setSchPosts(newSch);
    });
  }

  function openCreateForm(defaultDate?: string, postType: SchPostType = "general") {
    setFormMode("create");
    setFormPostType(postType);
    setEditTarget(defaultDate ? { id: "", title: "", start_date: defaultDate, type: "schedule" } : null);
    setFormOpen(true);
  }

  function openCompetitionPicker(defaultDate?: string) {
    setPickerDefaultDate(defaultDate);
    setPickerOpen(true);
  }

  function handlePickedCompetition(competition: Competition) {
    setSelectedCompetition(competition);
    setDetailOpen(true);
  }

  async function handleCompetitionCreated(competition: Competition) {
    setSelectedCompetition(competition);
    setDetailOpen(true);
    await handleSchPostSuccess();
  }

  function openEditForm(race: CalendarRace) {
    setFormMode("view");
    setEditTarget(race);
    setFormOpen(true);
  }

  async function handleSchPostSuccess() {
    router.refresh();
    const { gigang, mine, schPosts: newSch } = await fetchMonthData(viewMonth);
    setGigangRaces(gigang);
    setMyRaces(mine);
    setSchPosts(newSch);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SectionLabel>SCHEDULE</SectionLabel>
          {/* 뷰 전환 토글 */}
          <div className="flex items-center rounded-md bg-secondary p-0.5">
            <button
              onClick={() => setView("calendar")}
              aria-label="캘린더 뷰"
              className={cn(
                "flex size-6 items-center justify-center rounded transition-colors",
                view === "calendar" ? "bg-background shadow-sm" : "hover:bg-background/50",
              )}
            >
              <CalendarDays
                className={cn(
                  "size-3.5 transition-colors",
                  view === "calendar" ? "text-foreground" : "text-muted-foreground",
                )}
              />
            </button>
            <button
              onClick={() => setView("list")}
              aria-label="리스트 뷰"
              className={cn(
                "flex size-6 items-center justify-center rounded transition-colors",
                view === "list" ? "bg-background shadow-sm" : "hover:bg-background/50",
              )}
            >
              <List
                className={cn(
                  "size-3.5 transition-colors",
                  view === "list" ? "text-foreground" : "text-muted-foreground",
                )}
              />
            </button>
          </div>
        </div>


        {/* 월 네비게이션 — 캘린더뷰에서만 표시 */}
        {view === "calendar" && (
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
        )}
      </div>

      {view === "calendar" ? (
        <>
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
                  return <div key={`empty-${idx}`} className="h-15 border-t border-border/40" />;
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
                      "flex h-15 flex-col gap-px overflow-hidden border-t border-border/40 px-0.5 pt-0.5 text-left transition-colors",
                      isSelected && "bg-secondary/60",
                    )}
                    aria-pressed={isSelected}
                  >
                    {/* 날짜 숫자 + 초과 개수 */}
                    <div className="flex items-center justify-center gap-0.5">
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
                      {races.length > 3 && (
                        <span className="text-[8px] font-medium text-muted-foreground leading-none">
                          +{races.length - 3}
                        </span>
                      )}
                    </div>

                    {/* 이벤트 목록 — 최대 3개 */}
                    <div className="flex flex-col gap-px">
                      {races.slice(0, 3).map((race) => (
                        <span
                          key={race.id}
                          className={cn(
                            "w-full overflow-hidden rounded-sm px-0.5 text-left text-[7px] font-medium leading-[1.5]",
                            race.type === "mine"
                              ? "bg-success/20 text-success"
                              : race.type === "schedule"
                                ? "bg-info/15 text-info"
                                : "bg-warning/15 text-warning",
                          )}
                          style={{ whiteSpace: "nowrap", textOverflow: "clip" }}
                        >
                          {race.title}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 날짜 패널 — 항상 표시, 클릭으로 날짜 변경 */}
          {(() => {
            const panelRaces = eventsByDate.get(selectedDate) ?? [];
            const [, , dd] = selectedDate.split("-");
            return (
              <div className="mt-1 rounded-xl bg-secondary/50 px-3 py-2">
                <div className="flex gap-2">
                  {/* 날짜 + 추가 버튼 컬럼 */}
                  <div className="flex shrink-0 flex-col items-center gap-0">
                    <span className="text-[18px] font-bold leading-none text-foreground tabular-nums">
                      {parseInt(dd, 10)}일
                    </span>
                    {memberStatus.status === "ready" && (
                      <AddScheduleDropdown
                        onAddSchedule={() => openCreateForm(selectedDate)}
                        onAddCompetition={() => openCompetitionPicker(selectedDate)}
                      />
                    )}
                  </div>

                  {/* 일정 목록 */}
                  {panelRaces.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">일정 없음</span>
                  ) : (
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {panelRaces.map((race) => {
                      const isMine = race.type === "mine";
                      const isComp = race.type === "gigang" || race.type === "mine";
                      return (
                        <div key={race.id} className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "w-0.5 shrink-0 self-stretch rounded-full",
                              isMine ? "bg-success" : race.type === "schedule" ? "bg-info" : "bg-warning",
                            )}
                          />
                          <button
                            onClick={() => race.type === "schedule" ? openEditForm(race) : handleRaceClick(race)}
                            className="flex min-w-0 flex-1 flex-col gap-0.5 text-left transition-opacity hover:opacity-70"
                          >
                            <span className="truncate text-[11px] font-medium text-foreground">
                              {race.title}
                              {isComp && race.location && (
                                <span className="font-normal text-muted-foreground"> · {race.location}</span>
                              )}
                              {race.type === "schedule" && race.post_type && schPostTypeInlineLabel[race.post_type as SchPostType] && (
                                <span className="font-normal text-muted-foreground"> · {schPostTypeInlineLabel[race.post_type as SchPostType]}</span>
                              )}
                            </span>
                            {race.type === "schedule" && race.evt_stt_at && (
                              <span className="text-[9px] text-muted-foreground tabular-nums">
                                {dayjs(race.evt_stt_at).format("HH:mm")}{race.evt_end_at ? `~${dayjs(race.evt_end_at).format("HH:mm")}` : ""}
                              </span>
                            )}
                          </button>
                          {isComp && (
                            <div className="flex shrink-0 items-center gap-1">
                              {(race.regCount ?? 0) > 0 && (
                                <span className="text-[10px] tabular-nums text-muted-foreground">{race.regCount}명</span>
                              )}
                              <button
                                onClick={() => handleRaceClick(race)}
                                className={cn(
                                  "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors",
                                  isMine
                                    ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
                                    : "border-border text-foreground hover:bg-muted",
                                )}
                              >
                                참가
                              </button>
                            </div>
                          )}
                          {race.type === "schedule" && race.url && (
                            <button
                              onClick={() => openEditForm(race)}
                              className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
                            >
                              링크
                            </button>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </>
      ) : (
        /* 리스트뷰 */
        <div className="flex flex-col">
          <ScheduleListView
            teamId={teamId}
            memberId={memberId}
            initialMonthKey={initialMonth.slice(0, 7)}
            initialRaces={[...initMine, ...initSchPosts, ...initGigang]}
            onClickSchedule={openEditForm}
            onClickCompetition={handleRaceClick}
          />
          {memberStatus.status === "ready" && (
            <div className="flex justify-start pt-1.5">
              <AddScheduleDropdown
                onAddSchedule={() => openCreateForm(today)}
                onAddCompetition={() => openCompetitionPicker(today)}
              />
            </div>
          )}
        </div>
      )}

      {/* 대회 선택 다이얼로그 */}
      <CompetitionPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        defaultDate={pickerDefaultDate}
        cmmCdRows={cmmCdRows}
        excludedCompIds={new Set([...gigangRaces, ...myRaces].map((r) => r.id))}
        onSelectCompetition={handlePickedCompetition}
        onCompetitionCreated={handleCompetitionCreated}
      />

      {/* 일정 등록/수정 다이얼로그 */}
      <SchPostFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        defaultPostType={formPostType}
        currentMemberId={memberStatus.status === "ready" ? memberStatus.memberId : undefined}
        isAdmin={memberStatus.status === "ready" ? memberStatus.admin : false}
        initialData={
          (formMode === "view" || formMode === "edit") && editTarget
            ? {
                sch_post_id: editTarget.id,
                sch_nm: editTarget.title,
                post_type: editTarget.post_type as SchPostType | undefined,
                evt_stt_at: editTarget.start_date,
                evt_end_at: editTarget.end_date,
                url: editTarget.url,
                cont_txt: editTarget.cont_txt,
                crt_by: editTarget.crt_by,
              }
            : formMode === "create" && editTarget?.start_date
              ? { sch_post_id: "", sch_nm: "", evt_stt_at: editTarget.start_date }
              : undefined
        }
        onSuccess={handleSchPostSuccess}
      />

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
