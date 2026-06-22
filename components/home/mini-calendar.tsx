"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";

import { compEvtTypeContainsHangul } from "@/lib/comp-evt-type";
import { dayjs, todayKST, currentMonthKST, daysInMonth } from "@/lib/dayjs";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";
import { ensureTeamCompPlanRel } from "@/lib/queries/ensure-team-comp-plan-rel";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { schPostTypeInlineLabel } from "@/lib/validations/schedule-types";
import type { SchPostType } from "@/lib/validations/schedule-types";

import { getMentionMembers } from "@/app/actions/comment/get-mention-members";
import { getOrCreateCompEvtIdForParticipation } from "@/app/actions/get-or-create-comp-evt-for-participation";
import { revalidateCompetitions } from "@/app/actions/revalidate-competitions";


import dynamic from "next/dynamic";

import type { CmntRow } from "@/components/comment/comment-item";
import type { MemberOption } from "@/components/comment/mention-input";
import { Micro, SectionLabel } from "@/components/common/typography";
import type { CompetitionDetailDialogProps } from "@/components/races/competition-detail-dialog";
import type { Competition, CompetitionRegistration, MemberStatus } from "@/components/races/types";
import type { SchPostFormDialogProps } from "@/components/schedule/sch-post-form-dialog";

const AddScheduleDropdown = dynamic(
  () => import("@/components/home/add-schedule-dropdown").then((m) => m.AddScheduleDropdown),
  { ssr: false }
);

const CompetitionPickerDialog = dynamic(
  () => import("@/components/home/competition-picker-dialog").then((m) => m.CompetitionPickerDialog),
  { ssr: false }
);

const ScheduleListView = dynamic(
  () => import("@/components/home/schedule-list-view").then((m) => m.ScheduleListView),
  { ssr: false }
);

const SchPostDetailDialog = dynamic(
  () => import("@/components/schedule/sch-post-detail-dialog").then((m) => m.SchPostDetailDialog),
  { ssr: false }
);

const CompetitionDetailDialog = dynamic<CompetitionDetailDialogProps>(
  () =>
    import("@/components/races/competition-detail-dialog").then(
      (m) => m.CompetitionDetailDialog
    ),
  { ssr: false }
);

const SchPostFormDialog = dynamic<SchPostFormDialogProps>(
  () =>
    import("@/components/schedule/sch-post-form-dialog").then(
      (m) => m.SchPostFormDialog
    ),
  { ssr: false }
);

import type { GatheringFormDialogProps } from "@/components/schedule/gathering-form-dialog";
const GatheringFormDialog = dynamic<GatheringFormDialogProps>(
  () =>
    import("@/components/schedule/gathering-form-dialog").then(
      (m) => m.GatheringFormDialog
    ),
  { ssr: false }
);

import type { GatheringDetailDialogProps, GatheringAttendee } from "@/components/schedule/gathering-detail-dialog";
const GatheringDetailDialog = dynamic<GatheringDetailDialogProps>(
  () =>
    import("@/components/schedule/gathering-detail-dialog").then(
      (m) => m.GatheringDetailDialog
    ),
  { ssr: false }
);




export type CalendarRace = {
  id: string;
  short_id?: string | null;
  title: string;
  start_date: string;
  type: "gigang" | "mine" | "schedule" | "gathering" | "gathering_mine";
  // 공통 선택 필드
  end_date?: string | null;
  location?: string | null;
  regCount?: number;
  // schedule / gathering 전용
  url?: string | null;
  cont_txt?: string | null;
  crt_by?: string;
  crt_by_nm?: string | null;
  post_type?: string | null;
  // 시간 표시용 (원본 일시 문자열)
  evt_stt_at?: string | null;
  evt_end_at?: string | null;
  cmntCount?: number;
};

type MiniCalendarProps = {
  gigangRaces: CalendarRace[];
  myRaces: CalendarRace[];
  schPosts: CalendarRace[];
  gatherings: CalendarRace[];
  teamId: string;
  memberId?: string;
  memberAvatarUrl?: string | null;
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
  gatherings: initGatherings,
  teamId,
  memberId,
  memberAvatarUrl,
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
  const [gatherings, setGatherings] = useState(initGatherings);
  const [listViewKey, setListViewKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  // 일정 폼 다이얼로그 상태
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formPostType, setFormPostType] = useState<SchPostType | undefined>(undefined);
  const [editTarget, setEditTarget] = useState<CalendarRace | null>(null);

  // 소식 상세 다이얼로그 상태 (일반 멤버용)
  const [schDetailPost, setSchDetailPost] = useState<CalendarRace | null>(null);
  const [schDetailOpen, setSchDetailOpen] = useState(false);
  const [schDetailInitialComments, setSchDetailInitialComments] = useState<CmntRow[] | undefined>(undefined);

  // 모임 폼 다이얼로그 상태
  const [gthrFormOpen, setGthrFormOpen] = useState(false);
  const [gthrDefaultDate, setGthrDefaultDate] = useState<string | undefined>(undefined);

  // 모임 상세 다이얼로그 상태
  const [gthrDetailOpen, setGthrDetailOpen] = useState(false);
  const [gthrDetailRace, setGthrDetailRace] = useState<(CalendarRace & { maxPrtCnt?: number | null; attendees?: GatheringAttendee[]; sprt_cd?: string | null }) | null>(null);
  const [gthrDetailAttending, setGthrDetailAttending] = useState(false);
  const [gthrDetailComments, setGthrDetailComments] = useState<CmntRow[] | undefined>(undefined);
  const [gthrEditTarget, setGthrEditTarget] = useState<CalendarRace | null>(null);

  // 대회 선택 다이얼로그 상태
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDefaultDate, setPickerDefaultDate] = useState<string | undefined>(undefined);

  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [selectedDate, setSelectedDate] = useState<string>(() => todayKST());
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [compDetailInitialComments, setCompDetailInitialComments] = useState<CmntRow[] | undefined>(undefined);
  const [registrationsByCompetitionId, setRegistrationsByCompetitionId] =
    useState<Record<string, CompetitionRegistration>>(initialRegistrationsByCompetitionId);

  const memberStatus = initialMemberStatus;

  // 멤버 목록 캐시 — 첫 다이얼로그 열릴 때 1회 조회 후 재사용
  const [membersCache, setMembersCache] = useState<MemberOption[] | null>(null)
  const membersFetchingRef = useRef(false)

  useEffect(() => {
    if (memberStatus.status !== "ready") return
    if (membersCache !== null || membersFetchingRef.current) return
    const isAnyDialogOpen = schDetailOpen || detailOpen || gthrDetailOpen
    if (!isAnyDialogOpen) return
    membersFetchingRef.current = true
    getMentionMembers()
      .then(setMembersCache)
      .catch(() => { membersFetchingRef.current = false })
  }, [schDetailOpen, detailOpen, gthrDetailOpen, membersCache, memberStatus.status])

  // 알림 딥링크: /?post=<id> 또는 /?comp=<id>로 진입 시 해당 상세 자동 오픈
  const searchParams = useSearchParams()
  const deepLinkPostId = searchParams.get("post")
  const deepLinkCompId = searchParams.get("comp")
  const deepLinkGthrId = searchParams.get("gthr")

  useEffect(() => {
    if (deepLinkGthrId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deepLinkGthrId)
      const query = isUuid
        ? supabase.from("gthr_mst").select("gthr_id, short_id, gthr_nm, gthr_type_enm, stt_at, end_at, loc_txt, desc_txt, crt_by").eq("gthr_id", deepLinkGthrId).maybeSingle()
        : supabase.from("gthr_mst").select("gthr_id, short_id, gthr_nm, gthr_type_enm, stt_at, end_at, loc_txt, desc_txt, crt_by").eq("short_id", deepLinkGthrId).maybeSingle()

      query.then(({ data }) => {
        if (!data) return
        const race: CalendarRace = {
          id: data.gthr_id,
          short_id: data.short_id ?? null,
          title: data.gthr_nm,
          start_date: dayjs(data.stt_at).tz("Asia/Seoul").format("YYYY-MM-DD"),
          type: "gathering",
          post_type: data.gthr_type_enm,
          location: data.loc_txt ?? null,
          cont_txt: data.desc_txt ?? null,
          evt_stt_at: data.stt_at,
          evt_end_at: data.end_at ?? null,
          crt_by: data.crt_by,
        }
        openGatheringDetail(race).then(() => {
          router.replace("/")
        })
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkGthrId])

  useEffect(() => {
    if (deepLinkPostId) {
      // short_id로 먼저 조회, 없으면 UUID fallback (기존 알림 호환)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deepLinkPostId)
      const query = isUuid
        ? supabase.from("sch_post_mst").select("sch_post_id, short_id, sch_nm, post_type, evt_stt_at, evt_end_at, url, cont_txt, crt_by").eq("sch_post_id", deepLinkPostId).maybeSingle()
        : supabase.from("sch_post_mst").select("sch_post_id, short_id, sch_nm, post_type, evt_stt_at, evt_end_at, url, cont_txt, crt_by").eq("short_id", deepLinkPostId).maybeSingle()

      query.then(({ data }) => {
        if (!data) return
        const commentPromise = memberId
          ? fetchComments("sch_post", data.sch_post_id)
          : Promise.resolve(undefined)
        commentPromise.then((finalComments) => {
          setSchDetailPost({
            id: data.sch_post_id,
            short_id: data.short_id ?? null,
            title: data.sch_nm,
            start_date: data.evt_stt_at ? dayjs(data.evt_stt_at).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
            type: "schedule",
            url: data.url ?? null,
            cont_txt: data.cont_txt ?? null,
            crt_by: data.crt_by ?? undefined,
            post_type: data.post_type ?? null,
            evt_stt_at: data.evt_stt_at ?? null,
            evt_end_at: data.evt_end_at ?? null,
          })
          setSchDetailInitialComments(finalComments)
          setSchDetailOpen(true)
          router.replace("/")
        })
      })
    }

    if (deepLinkCompId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deepLinkCompId)
      const query = isUuid
        ? supabase.from("comp_mst").select("comp_id, short_id, comp_nm, comp_sprt_cd, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_type)").eq("comp_id", deepLinkCompId).maybeSingle()
        : supabase.from("comp_mst").select("comp_id, short_id, comp_nm, comp_sprt_cd, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_type)").eq("short_id", deepLinkCompId).maybeSingle()

      query.then(({ data }) => {
        if (!data) return
        const commentPromise = memberId ? fetchComments("comp", data.comp_id) : Promise.resolve(undefined)
        commentPromise.then((finalComments) => {
          setSelectedCompetition({
            id: data.comp_id,
            short_id: data.short_id ?? null,
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
          })
          setCompDetailInitialComments(finalComments)
          setDetailOpen(true)
          router.replace("/")
        })
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkPostId, deepLinkCompId])

  const today = todayKST();
  const [yearStr, monthStr] = viewMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const totalDays = daysInMonth(year, month);
  const firstDayOfWeek = dayjs.tz(`${year}-${String(month).padStart(2, "0")}-01`, "Asia/Seoul").day();

  const allRaces = useMemo(() => [...myRaces, ...schPosts, ...gigangRaces, ...gatherings], [myRaces, schPosts, gigangRaces, gatherings]);

  // 날짜별 이벤트 목록 (mine 우선, schedule, gigang 순) — 기간 이벤트는 모든 날짜에 전개
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarRace[]>();
    const seen = new Set<string>();
    for (const race of allRaces) {
      const endDateStr = race.end_date
        ? dayjs(race.end_date).tz("Asia/Seoul").format("YYYY-MM-DD")
        : race.start_date;
      let cur = dayjs(race.start_date).tz("Asia/Seoul");
      const endDay = dayjs(endDateStr).tz("Asia/Seoul");
      while (!cur.isAfter(endDay)) {
        const dateStr = cur.format("YYYY-MM-DD");
        const key = `${dateStr}:${race.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          const list = map.get(dateStr) ?? [];
          list.push(race);
          map.set(dateStr, list);
        }
        cur = cur.add(1, "day");
      }
    }
    return map;
  }, [allRaces]);

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

  // 주차별 스패닝 이벤트 레인 계산
  const weekEventLanes = useMemo(() => {
    return weeks.map((week) => {
      const colDates = week.map((day) =>
        day !== null
          ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          : null
      );
      const validDates = colDates.filter((d): d is string => d !== null);
      if (validDates.length === 0) return [];
      const weekStart = validDates[0];
      const weekEnd = validDates[validDates.length - 1];

      const seen = new Set<string>();
      const active = allRaces.filter((race) => {
        if (seen.has(race.id)) return false;
        seen.add(race.id);
        const endStr = race.end_date ? dayjs(race.end_date).tz("Asia/Seoul").format("YYYY-MM-DD") : race.start_date;
        return race.start_date <= weekEnd && endStr >= weekStart;
      });

      const positioned = active.map((race) => {
        const endStr = race.end_date ? dayjs(race.end_date).tz("Asia/Seoul").format("YYYY-MM-DD") : race.start_date;
        let colStart = colDates.findIndex((d) => d !== null && d >= race.start_date);
        if (colStart === -1) colStart = colDates.findIndex((d) => d !== null) ?? 0;
        let colEnd = colStart;
        for (let i = colStart + 1; i < 7; i++) {
          if (colDates[i] !== null && colDates[i]! <= endStr) colEnd = i;
        }
        return {
          race,
          colStart,
          colSpan: colEnd - colStart + 1,
          startsThisWeek: race.start_date >= weekStart,
          endsThisWeek: endStr <= weekEnd,
        };
      });

      // colSpan 내림차순 → colStart 오름차순 정렬: 긴 이벤트가 낮은 슬롯 선점
      const sorted = [...positioned].sort((a, b) =>
        b.colSpan - a.colSpan || a.colStart - b.colStart
      );

      const slotEnds: number[] = [];
      const withSlot = sorted.map((ep) => {
        let slot = slotEnds.findIndex((e) => e < ep.colStart);
        if (slot === -1) { slot = slotEnds.length; slotEnds.push(-1); }
        slotEnds[slot] = ep.colStart + ep.colSpan - 1;
        return { ...ep, slot };
      });

      // 원래 순서(colStart → id)로 돌려서 반환
      return withSlot.sort((a, b) => a.colStart - b.colStart || a.race.id.localeCompare(b.race.id));
    });
  }, [weeks, allRaces, year, month]);

  function formatCellDate(day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  async function fetchComments(entityType: "sch_post" | "comp" | "gathering", entityId: string): Promise<CmntRow[]> {
    const { data } = await supabase
      .from("cmnt_mst")
      .select("cmnt_id, prnt_id, mem_id, cont_txt, edit_yn, del_yn, crt_at, upd_at, mem_mst!cmnt_mst_mem_id_fkey(mem_nm, avatar_url)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("team_id", teamId)
      .order("crt_at", { ascending: true })
    return (data ?? []).map((row) => {
      const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst
      return {
        cmnt_id: row.cmnt_id,
        prnt_id: row.prnt_id,
        mem_id: row.mem_id,
        mem_nm: (mem as { mem_nm: string } | null)?.mem_nm ?? "멤버",
        avatar_url: (mem as { avatar_url?: string | null } | null)?.avatar_url ?? null,
        cont_txt: row.cont_txt,
        edit_yn: row.edit_yn,
        del_yn: row.del_yn,
        crt_at: row.crt_at,
        upd_at: row.upd_at,
      }
    })
  }

  async function handleRaceClick(race: CalendarRace) {
    const [{ data }, comments] = await Promise.all([
      supabase
        .from("comp_mst")
        .select("comp_id, short_id, comp_nm, comp_sprt_cd, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_type)")
        .eq("comp_id", race.id)
        .single(),
      memberId ? fetchComments("comp", race.id) : Promise.resolve(undefined),
    ]);

    const comp: Competition = data
      ? {
          id: data.comp_id,
          short_id: data.short_id ?? null,
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
          short_id: null,
          external_id: "",
          sport: null,
          title: race.title,
          start_date: race.start_date,
          end_date: null,
          location: null,
          event_types: null,
          source_url: null,
        };

    // fetch 완료 후 한 번에 설정 — 이전 댓글이 남는 버그 방지
    setSelectedCompetition(comp);
    setCompDetailInitialComments(comments);
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

    const [
      { data: teamComps },
      myRegsResult,
      { data: schPostRows },
      { data: gthrRows },
    ] = await Promise.all([
      supabase.rpc("get_public_team_competitions", { p_team_id: teamId, p_start: newMonth, p_end: lastDay }),
      memberId
        ? supabase
            .from("comp_reg_rel")
            .select("team_comp_plan_rel!inner(comp_id, comp_mst!inner(comp_id, comp_nm, stt_dt, loc_nm))")
            .eq("mem_id", memberId)
            .eq("team_comp_plan_rel.team_id", teamId)
            .eq("vers", 0)
            .eq("del_yn", false)
        : Promise.resolve({ data: null }),
      supabase.rpc("get_public_team_sch_posts", { p_team_id: teamId, p_start: newMonth, p_end: lastDay }),
      memberId
        ? supabase.rpc("get_public_team_gatherings", { p_team_id: teamId, p_start: newMonth, p_end: lastDay, p_mem_id: memberId })
        : supabase.rpc("get_public_team_gatherings", { p_team_id: teamId, p_start: newMonth, p_end: lastDay }),
    ]);

    const newGigang: CalendarRace[] = (teamComps ?? [])
      .filter((row) => (row.reg_count ?? 0) > 0)
      .map((row) => ({ id: row.comp_id, title: row.comp_nm, start_date: row.stt_dt, type: "gigang" as const, location: row.loc_nm ?? null, regCount: row.reg_count ?? 0, cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined }));

    const calendarMetaMap = new Map(
      (teamComps ?? []).map((row) => [row.comp_id, { regCount: row.reg_count ?? 0, cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined }]),
    );

    const newMine: CalendarRace[] = memberId
      ? (myRegsResult.data ?? []).flatMap((r) => {
          const plan = Array.isArray(r.team_comp_plan_rel) ? r.team_comp_plan_rel[0] : r.team_comp_plan_rel;
          const comp = Array.isArray(plan?.comp_mst) ? plan.comp_mst[0] : plan?.comp_mst;
          if (!comp) return [];
          const meta = calendarMetaMap.get(comp.comp_id);
          const race: CalendarRace = { id: comp.comp_id, title: comp.comp_nm, start_date: comp.stt_dt, type: "mine", location: comp.loc_nm ?? null, regCount: meta?.regCount ?? 0, cmntCount: meta?.cmntCount };
          return race.start_date >= newMonth && race.start_date <= lastDay ? [race] : [];
        })
      : [];

    const newSchPosts: CalendarRace[] = (schPostRows ?? []).map((row) => ({
      id: row.sch_post_id,
      short_id: row.short_id ?? null,
      title: row.sch_nm,
      start_date: dayjs(row.evt_stt_at).tz("Asia/Seoul").format("YYYY-MM-DD"),
      type: "schedule" as const,
      post_type: row.post_type,
      end_date: row.evt_end_at,
      evt_stt_at: row.evt_stt_at,
      evt_end_at: row.evt_end_at,
      url: row.url,
      cont_txt: row.cont_txt,
      crt_by: row.crt_by,
      crt_by_nm: row.crt_by_nm ?? null,
      cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined,
    }));

    const newGatherings: CalendarRace[] = (gthrRows ?? []).map((row) => ({
      id: row.gthr_id,
      short_id: row.short_id ?? null,
      title: row.gthr_nm,
      start_date: dayjs(row.stt_at).tz("Asia/Seoul").format("YYYY-MM-DD"),
      end_date: row.end_at ? dayjs(row.end_at).tz("Asia/Seoul").format("YYYY-MM-DD") : null,
      type: (memberId && ("is_attending" in row ? row.is_attending : false) ? "gathering_mine" : "gathering") as CalendarRace["type"],
      post_type: row.gthr_type_enm,
      location: row.loc_txt ?? null,
      cont_txt: row.desc_txt ?? null,
      evt_stt_at: row.stt_at,
      evt_end_at: row.end_at ?? null,
      crt_by: row.crt_by,
      crt_by_nm: row.crt_by_nm ?? null,
      regCount: row.attd_count ? Number(row.attd_count) : 0,
      cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined,
    }));

    return { gigang: newGigang, mine: newMine, schPosts: newSchPosts, gatherings: newGatherings };
  }

  function navigate(dir: -1 | 1) {
    startTransition(async () => {
      const newMonthDayjs = dayjs(viewMonth).add(dir, "month");
      const newMonth = newMonthDayjs.format("YYYY-MM-01");
      const { gigang, mine, schPosts: newSch, gatherings: newGthr } = await fetchMonthData(newMonth);
      setViewMonth(newMonth);
      setGigangRaces(gigang);
      setMyRaces(mine);
      setSchPosts(newSch);
      setGatherings(newGthr);
    });
  }

  function openCreateForm(defaultDate?: string, postType?: SchPostType) {
    setFormMode("create");
    setFormPostType(postType);
    setEditTarget(defaultDate ? { id: "", title: "", start_date: defaultDate, type: "schedule" } : null);
    setFormOpen(true);
  }

  function openCompetitionPicker(defaultDate?: string) {
    setPickerDefaultDate(defaultDate);
    setPickerOpen(true);
  }

  async function handlePickedCompetition(competition: Competition) {
    const comments = memberId ? await fetchComments("comp", competition.id) : undefined;
    setSelectedCompetition(competition);
    setCompDetailInitialComments(comments);
    setDetailOpen(true);
  }

  async function handleCompetitionCreated(competition: Competition) {
    setCompDetailInitialComments([]);
    setSelectedCompetition(competition);
    setDetailOpen(true);
    await handleSchPostSuccess();
  }

  async function openSchPostDetail(race: CalendarRace) {
    const comments = memberId ? await fetchComments("sch_post", race.id) : undefined;
    // fetch 완료 후 한 번에 설정 — 이전 댓글이 남는 버그 방지
    setSchDetailPost(race);
    setSchDetailInitialComments(comments);
    setSchDetailOpen(true);
  }

  async function openGatheringDetail(race: CalendarRace) {
    const [comments, attdResult, gthrResult] = await Promise.all([
      memberId ? fetchComments("gathering", race.id) : Promise.resolve(undefined),
      memberId
        ? supabase.from("gthr_attd_rel").select("attd_id").eq("gthr_id", race.id).eq("mem_id", memberId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("gthr_mst").select("max_prt_cnt, sprt_cd, gthr_attd_rel(mem_id, mem_mst(mem_nm, avatar_url))").eq("gthr_id", race.id).maybeSingle(),
    ]);
    const attendees: GatheringAttendee[] = (gthrResult.data?.gthr_attd_rel ?? []).map((a) => {
      const mem = Array.isArray(a.mem_mst) ? a.mem_mst[0] : a.mem_mst;
      return { mem_id: a.mem_id, mem_nm: (mem as { mem_nm?: string | null } | null)?.mem_nm ?? null, avatar_url: (mem as { avatar_url?: string | null } | null)?.avatar_url ?? null };
    });
    setGthrDetailRace({ ...race, regCount: attendees.length, maxPrtCnt: gthrResult.data?.max_prt_cnt ?? null, attendees, sprt_cd: gthrResult.data?.sprt_cd ?? null });
    setGthrDetailAttending(!!attdResult.data);
    setGthrDetailComments(comments);
    setGthrDetailOpen(true);
  }

  async function handleSchPostSuccess() {
    const { gigang, mine, schPosts: newSch, gatherings: newGthr } = await fetchMonthData(viewMonth);
    setGigangRaces(gigang);
    setMyRaces(mine);
    setSchPosts(newSch);
    setGatherings(newGthr);
    setListViewKey((k) => k + 1);
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

            {/* 바둑판 그리드 — 주차별 스패닝 이벤트 바 */}
            <div className="flex flex-col">
              {weeks.map((week, weekIdx) => {
                const lanes = weekEventLanes[weekIdx] ?? [];
                const visibleLanes = lanes.filter((l) => l.slot < 3);
                return (
                  <div key={weekIdx} className="relative">
                    {/* 전체 높이 클릭 오버레이 — 선택 배경 + 날짜 선택 */}
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-7">
                      {week.map((day, colIdx) => {
                        if (day === null) return <div key={`ol-${weekIdx}-${colIdx}`} />;
                        const dateStr = formatCellDate(day);
                        const isSelected = selectedDate === dateStr;
                        return (
                          <button
                            key={`ol-${dateStr}`}
                            onClick={() => setSelectedDate(dateStr)}
                            className={cn(
                              "pointer-events-auto h-full w-full transition-colors",
                              isSelected && "bg-secondary/60",
                            )}
                            aria-label={`${day}일 선택`}
                            aria-pressed={isSelected}
                          />
                        );
                      })}
                    </div>

                    {/* 날짜 숫자 행 (표시 전용) */}
                    <div className="relative z-10 grid grid-cols-7" style={{ pointerEvents: "none" }}>
                      {week.map((day, colIdx) => {
                        if (day === null) {
                          return <div key={`e-${weekIdx}-${colIdx}`} className="h-8 border-t border-border/40" />;
                        }
                        const dateStr = formatCellDate(day);
                        const isToday = dateStr === today;
                        const overflowCount = Math.max(0, (eventsByDate.get(dateStr)?.length ?? 0) - 3);
                        return (
                          <div
                            key={`d-${dateStr}`}
                            className="flex h-8 flex-col items-center border-t border-border/40 pt-0.5"
                          >
                            <div className="flex items-center gap-0.5">
                              <span
                                className={cn(
                                  "flex size-6 items-center justify-center rounded-full text-[12px] font-medium",
                                  isToday && "bg-primary text-primary-foreground font-bold",
                                  !isToday && colIdx === 0 && "text-destructive",
                                  !isToday && colIdx === 6 && "text-primary",
                                  !isToday && colIdx !== 0 && colIdx !== 6 && "text-foreground",
                                )}
                              >
                                {day}
                              </span>
                              {overflowCount > 0 && (
                                <span className="text-[8px] font-medium leading-none text-muted-foreground">
                                  +{overflowCount}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 이벤트 바 행 — 최대 3슬롯 고정 높이 (주 행 높이 일정하게 유지) */}
                    <div
                      className="relative z-10 grid grid-cols-7 pb-1"
                      style={{ gridTemplateRows: "13px 13px 13px", rowGap: "1px", pointerEvents: "none" }}
                    >
                      {visibleLanes.map((lane) => (
                        <div
                          key={`${lane.race.id}-w${weekIdx}`}
                          style={{
                            gridColumn: `${lane.colStart + 1} / ${lane.colStart + lane.colSpan + 1}`,
                            gridRow: lane.slot + 1,
                          }}
                          className={cn(
                            "overflow-hidden px-0.5 text-[7px] font-medium leading-[13px]",
                            lane.startsThisWeek ? "rounded-l-sm" : "",
                            lane.endsThisWeek ? "rounded-r-sm" : "",
                            lane.race.type === "mine"
                              ? "bg-success/20 text-success"
                              : lane.race.type === "schedule"
                                ? "bg-info/15 text-info"
                                : lane.race.type === "gathering_mine"
                                  ? "bg-success/20 text-success"
                                  : lane.race.type === "gathering"
                                  ? "bg-violet-400/20 text-violet-500"
                                  : "bg-warning/15 text-warning",
                          )}
                        >
                          {lane.startsThisWeek ? lane.race.title : ""}
                        </div>
                      ))}
                    </div>
                  </div>
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
                  {/* 날짜 컬럼 */}
                  <div className="flex shrink-0 flex-col items-center">
                    <span className="text-[18px] font-bold leading-none text-foreground tabular-nums">
                      {parseInt(dd, 10)}일
                    </span>
                  </div>

                  {/* 일정 목록 */}
                  {panelRaces.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">일정 없음</span>
                  ) : (
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {panelRaces.map((race) => {
                    const isMine = race.type === "mine";
                    const isComp = race.type === "gigang" || race.type === "mine";
                    const isGathering = race.type === "gathering" || race.type === "gathering_mine";
                    const isGatheringMine = race.type === "gathering_mine";
                    return (
                      <button
                        key={race.id}
                        onClick={() =>
                          race.type === "schedule"
                            ? openSchPostDetail(race)
                            : isGathering
                              ? openGatheringDetail(race)
                              : handleRaceClick(race)
                        }
                        className="flex w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition-all active:scale-[0.98] active:bg-secondary hover:bg-secondary/60"
                      >
                        <span
                          className={cn(
                            "w-0.5 shrink-0 self-stretch rounded-full",
                            isMine ? "bg-success"
                              : race.type === "schedule" ? "bg-info"
                              : isGatheringMine ? "bg-success"
                              : isGathering ? "bg-violet-400"
                              : "bg-warning",
                          )}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[11px] font-medium text-foreground">
                            {race.title}
                            {race.type === "schedule" && race.post_type && schPostTypeInlineLabel[race.post_type as SchPostType] && (
                              <span className="font-normal text-muted-foreground"> · {schPostTypeInlineLabel[race.post_type as SchPostType]}</span>
                            )}
                          </span>
                          {isComp && (race.location || (race.cmntCount ?? 0) > 0) && (
                            <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                              {race.location && <span className="truncate">{race.location}</span>}
                              {(race.cmntCount ?? 0) > 0 && <span>💬 {race.cmntCount}</span>}
                            </span>
                          )}
                          {(race.type === "schedule" || isGathering) && (race.evt_stt_at || race.location || (race.cmntCount ?? 0) > 0) && (
                            <span className="flex items-center gap-1 text-[9px] text-muted-foreground tabular-nums">
                              {isGathering && race.location && <span className="truncate">{race.location}</span>}
                              {race.evt_stt_at && (
                                <span>
                                  {(() => {
                                    const stt = dayjs(race.evt_stt_at).tz("Asia/Seoul");
                                    const end = race.evt_end_at ? dayjs(race.evt_end_at).tz("Asia/Seoul") : null;
                                    const sameDay = !end || stt.format("YYYY-MM-DD") === end.format("YYYY-MM-DD");
                                    if (sameDay) return `${stt.format("HH:mm")}${end ? ` ~ ${end.format("HH:mm")}` : ""}`;
                                    const sameMonth = end && stt.month() === end.month() && stt.year() === end.year();
                                    const fmt = sameMonth ? "D일 HH:mm" : "M/D HH:mm";
                                    return `${stt.format(fmt)} ~ ${end!.format(fmt)}`;
                                  })()}
                                </span>
                              )}
                              {(race.cmntCount ?? 0) > 0 && <span>💬 {race.cmntCount}</span>}
                            </span>
                          )}
                        </span>
                        {isComp && (race.regCount ?? 0) > 0 && (
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{race.regCount}명</span>
                        )}
                        {isGathering && (race.regCount ?? 0) > 0 && (
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{race.regCount}명</span>
                        )}
                        {isComp && (
                          <span
                            className={cn(
                              "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium",
                              isMine
                                ? "border-success/40 bg-success/10 text-success"
                                : "border-border text-foreground",
                            )}
                          >
                            참가
                          </span>
                        )}
                        {isGathering && (
                          <span
                            className={cn(
                              "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium",
                              isGatheringMine
                                ? "border-success/40 bg-success/10 text-success"
                                : "border-violet-300/60 bg-violet-50 text-violet-500",
                            )}
                          >
                            {isGatheringMine ? "참석" : "모임"}
                          </span>
                        )}
                        {race.type === "schedule" && race.url && (
                          <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-foreground">
                            링크
                          </span>
                        )}
                      </button>
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
            key={listViewKey}
            teamId={teamId}
            memberId={memberId}
            initialMonthKey={viewMonth.slice(0, 7)}
            initialRaces={[...myRaces, ...schPosts, ...gigangRaces, ...gatherings]}
            onClickSchedule={openSchPostDetail}
            onClickCompetition={handleRaceClick}
            onClickGathering={openGatheringDetail}
          />
        </div>
      )}

      {/* FAB — 멤버만 표시, 캘린더뷰: 선택 날짜, 리스트뷰: 오늘 */}
      {memberStatus.status === "ready" && (
        <AddScheduleDropdown
          onAddSchedule={() => openCreateForm(view === "calendar" ? selectedDate : today)}
          onAddCompetition={() => openCompetitionPicker(view === "calendar" ? selectedDate : today)}
          onAddGathering={() => {
            setGthrDefaultDate(view === "calendar" ? selectedDate : today);
            setGthrFormOpen(true);
          }}
        />
      )}

      {/* 모임 폼 다이얼로그 (등록 + 수정 겸용) */}
      <GatheringFormDialog
        open={gthrFormOpen}
        onOpenChange={(v) => { setGthrFormOpen(v); if (!v) setGthrEditTarget(null); }}
        mode={gthrEditTarget ? "edit" : "create"}
        defaultDate={!gthrEditTarget ? gthrDefaultDate : undefined}
        initialData={gthrEditTarget ? {
          gthr_id: gthrEditTarget.id,
          gthr_nm: gthrEditTarget.title,
          gthr_type_enm: gthrEditTarget.post_type ?? "general",
          sprt_cd: (gthrDetailRace?.sprt_cd) ?? null,
          stt_at: gthrEditTarget.evt_stt_at ?? gthrEditTarget.start_date,
          end_at: gthrEditTarget.evt_end_at ?? null,
          loc_txt: gthrEditTarget.location ?? null,
          desc_txt: gthrEditTarget.cont_txt ?? null,
          max_prt_cnt: gthrDetailRace?.maxPrtCnt ?? null,
        } : undefined}
        onSuccess={async () => {
          const { gigang, mine, schPosts: newSch, gatherings: newGthr } = await fetchMonthData(viewMonth);
          setGigangRaces(gigang);
          setMyRaces(mine);
          setSchPosts(newSch);
          setGatherings(newGthr);
          setListViewKey((k) => k + 1);
          setGthrEditTarget(null);
        }}
      />

      {/* 모임 상세 다이얼로그 */}
      <GatheringDetailDialog
        gathering={gthrDetailRace}
        open={gthrDetailOpen}
        onOpenChange={setGthrDetailOpen}
        teamId={teamId}
        currentMemberId={memberStatus.status === "ready" ? memberStatus.memberId : undefined}
        currentMemberName={memberStatus.status === "ready" ? memberStatus.fullName : undefined}
        currentMemberAvatarUrl={memberStatus.status === "ready" ? memberAvatarUrl : undefined}
        isAdmin={memberStatus.status === "ready" ? memberStatus.admin : false}
        isAttending={gthrDetailAttending}
        members={membersCache ?? []}
        initialComments={gthrDetailComments}
        onEdit={() => {
          if (!gthrDetailRace) return;
          setGthrDetailOpen(false);
          setGthrEditTarget(gthrDetailRace);
          setGthrFormOpen(true);
        }}
        onDelete={async () => {
          const { gigang, mine, schPosts: newSch, gatherings: newGthr } = await fetchMonthData(viewMonth);
          setGigangRaces(gigang);
          setMyRaces(mine);
          setSchPosts(newSch);
          setGatherings(newGthr);
          setListViewKey((k) => k + 1);
        }}
        onAttendanceChange={async () => {
          const [{ gatherings: newGthr }, gthrResult, attdResult] = await Promise.all([
            fetchMonthData(viewMonth),
            gthrDetailRace
              ? supabase.from("gthr_mst").select("max_prt_cnt, sprt_cd, gthr_attd_rel(mem_id, mem_mst(mem_nm, avatar_url))").eq("gthr_id", gthrDetailRace.id).maybeSingle()
              : Promise.resolve({ data: null }),
            gthrDetailRace && memberId
              ? supabase.from("gthr_attd_rel").select("attd_id").eq("gthr_id", gthrDetailRace.id).eq("mem_id", memberId).maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
          setGatherings(newGthr);
          if (gthrDetailRace && gthrResult.data) {
            const attendees: GatheringAttendee[] = (gthrResult.data.gthr_attd_rel ?? []).map((a) => {
              const mem = Array.isArray(a.mem_mst) ? a.mem_mst[0] : a.mem_mst;
              return { mem_id: a.mem_id, mem_nm: (mem as { mem_nm?: string | null } | null)?.mem_nm ?? null, avatar_url: (mem as { avatar_url?: string | null } | null)?.avatar_url ?? null };
            });
            setGthrDetailRace((prev) => prev ? { ...prev, regCount: attendees.length, attendees } : prev);
            setGthrDetailAttending(!!attdResult.data);
          }
        }}
      />

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

      {/* 소식 상세 다이얼로그 */}
      <SchPostDetailDialog
        post={schDetailPost}
        open={schDetailOpen}
        onOpenChange={setSchDetailOpen}
        teamId={teamId}
        currentMemberId={memberStatus.status === "ready" ? memberStatus.memberId : undefined}
        isAdmin={memberStatus.status === "ready" ? memberStatus.admin : false}
        members={membersCache ?? []}
        initialComments={schDetailInitialComments}
        onEdit={() => {
          if (!schDetailPost) return;
          setSchDetailOpen(false);
          setFormMode("edit");
          setEditTarget(schDetailPost);
          setFormOpen(true);
        }}
        onDelete={handleSchPostSuccess}
      />

      {/* 일정 등록/수정 다이얼로그 */}
      <SchPostFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        defaultPostType={formPostType}
        initialData={
          formMode === "edit" && editTarget
            ? {
                sch_post_id: editTarget.id,
                sch_nm: editTarget.title,
                post_type: editTarget.post_type as SchPostType | undefined,
                evt_stt_at: editTarget.evt_stt_at ?? editTarget.start_date,
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
        members={membersCache ?? []}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCreate={createRegistration}
        onUpdate={updateRegistration}
        onDelete={deleteRegistration}
        initialComments={compDetailInitialComments}
        onCompetitionUpdated={async () => {
          await revalidateCompetitions();
          window.location.reload();
        }}
      />
    </div>
  );
}
