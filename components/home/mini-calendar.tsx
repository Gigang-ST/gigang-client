"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useSearchParams } from "next/navigation";

import { CalendarDays, ChevronLeft, ChevronRight, List, Share2 } from "lucide-react";
import { toast } from "sonner";

import { buildWeeklyShareText } from "@/components/home/build-weekly-share-text";
import { compEvtTypeContainsHangul } from "@/lib/comp-evt-type";
import { dayjs, todayKST, currentMonthKST, daysInMonth, gridDateRange } from "@/lib/dayjs";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";
import { ensureTeamCompPlanRel } from "@/lib/queries/ensure-team-comp-plan-rel";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { schPostTypeInlineLabel } from "@/lib/validations/schedule-types";
import type { SchPostType } from "@/lib/validations/schedule-types";

import { SportTag } from "@/components/schedule/sport-tag";

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

import type { GatheringFormDialogProps, GatheringFormPrefill } from "@/components/schedule/gathering-form-dialog";
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

const ShareSheet = dynamic(
  () => import("@/components/common/share-sheet").then((m) => m.ShareSheet),
  { ssr: false }
);

/**
 * 딥링크 쿼리(?post=·?comp=·?gthr=)만 현재 URL에서 골라 동기 제거한다.
 * 다른 쿼리·해시·경로는 보존한다. (키 목록은 lib/notifications/deep-link.ts
 * 라우트 규칙과 짝 — 새 딥링크 키를 추가하면 여기도 함께 갱신할 것)
 *
 * 반드시 상세 다이얼로그를 열기(setOpen) 전에 호출할 것 — router.replace는
 * transition이라 다이얼로그의 pushState(useDialogHistoryBack)가 먼저 쌓인 뒤
 * 그 위 항목만 교체되고, 뒤로가기가 딥링크 URL 항목으로 돌아가 상세가
 * 다시 열리는 무한 루프가 생긴다. 네이티브 replaceState는 동기 실행이며
 * Next가 패치해 useSearchParams도 함께 동기화된다.
 *
 * 비동기 콜백(fetch .then)에서 호출할 땐 이펙트의 cancelled 가드를 먼저
 * 통과할 것 — 대상 키만 지우므로 경로는 보존되지만, 페이지를 떠난 뒤의
 * 히스토리 조작 자체가 부수효과다.
 */
function clearDeepLinkParams() {
  const url = new URL(window.location.href);
  for (const key of ["post", "comp", "gthr"]) url.searchParams.delete(key);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/**
 * 딥링크 대상이 삭제·미존재로 조회되지 않을 때 — 무반응 대신 안내하고,
 * 죽은 파라미터를 정리해 새로고침마다 헛조회가 반복되지 않게 한다.
 */
function notifyDeepLinkMissing(label: string) {
  toast.error(`삭제되었거나 찾을 수 없는 ${label}입니다.`);
  clearDeepLinkParams();
}




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
  /** gathering 전용 — 최대 인원 (null=제한 없음) */
  maxPrtCnt?: number | null;
  // schedule / gathering 전용
  url?: string | null;
  cont_txt?: string | null;
  crt_by?: string;
  crt_by_nm?: string | null;
  post_type?: string | null;
  // gathering 전용 — 종목 코드 (러닝/트레일러닝/하이록스 등)
  sprt_cd?: string | null;
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

import { type FilterType, FILTER_TYPES, matchesFilter } from "./schedule-filter";

// 달력 그리드 셀 — 이번 달(inMonth) / 앞뒤 달(inMonth=false) 날짜를 함께 표현
type Cell = { date: string; day: number; inMonth: boolean };

// 일정 표시 우선순위 — 하단 패널·그리드 이벤트 바 공용.
// ① 내가 참여 중(모임참석·대회참가) ② 모임 ③ 정보 ④ 대회 순으로 위/앞에 배치한다.
function eventDisplayOrder(r: CalendarRace): number {
  if (r.type === "gathering_mine" || r.type === "mine") return 0; // 참여 중
  if (r.type === "gathering") return 1;
  if (r.type === "schedule") return 2;
  return 3; // gigang(비참여 대회)
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
  const initialMonth = currentMonthKST();
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [gigangRaces, setGigangRaces] = useState(initGigang);
  const [myRaces, setMyRaces] = useState(initMine);
  const [schPosts, setSchPosts] = useState(initSchPosts);
  const [gatherings, setGatherings] = useState(initGatherings);
  const [listViewKey, setListViewKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  // 월별 데이터 캐시 — 이미 조회한 달은 즉시 반영, 인접 달은 프리페치
  type MonthData = { gigang: CalendarRace[]; mine: CalendarRace[]; schPosts: CalendarRace[]; gatherings: CalendarRace[] };
  const monthCacheRef = useRef(new Map<string, MonthData>());
  const cacheVersionRef = useRef(0);

  // 주간 일정 공유 시트 상태
  const [weeklyShareOpen, setWeeklyShareOpen] = useState(false);
  const [weeklyShareText, setWeeklyShareText] = useState("");

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
  // 복제("이 내용으로 새 모임") 프리필 — 상세에서 복제 버튼을 눌렀을 때만 설정
  const [gthrPrefill, setGthrPrefill] = useState<GatheringFormPrefill | null>(null);

  // 모임 상세 다이얼로그 상태
  const [gthrDetailOpen, setGthrDetailOpen] = useState(false);
  const [gthrDetailRace, setGthrDetailRace] = useState<(CalendarRace & { maxPrtCnt?: number | null; attendees?: GatheringAttendee[]; sprt_cd?: string | null }) | null>(null);
  const [gthrDetailAttending, setGthrDetailAttending] = useState(false);
  // 상세를 "즉시 열고" 참석자/정원을 뒤에서 채우는 동안 true — 다이얼로그가 스켈레톤을 그린다
  const [gthrDetailLoading, setGthrDetailLoading] = useState(false);
  // 상세 오픈 요청 토큰 — 인스턴트 오픈·딥링크는 openingLock을 우회하므로,
  // 늦게 도착한 이전 조회 응답이 새로 연 모임의 참석/로딩 상태를 덮지 않게 모든 오픈 경로에서 증가시킨다
  const gthrOpenReqRef = useRef(0);
  const [gthrDetailComments, setGthrDetailComments] = useState<CmntRow[] | undefined>(undefined);
  const [gthrEditTarget, setGthrEditTarget] = useState<CalendarRace | null>(null);
  // 방금 등록한 모임으로 상세가 열렸는지 — 공유 유도 안내 노출용
  const [gthrJustCreated, setGthrJustCreated] = useState(false);

  // 대회 선택 다이얼로그 상태
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDefaultDate, setPickerDefaultDate] = useState<string | undefined>(undefined);

  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [filterType, setFilterType] = useState<FilterType>("all");

  // 필터 선택 기억 — SSR/하이드레이션 불일치를 피해 마운트 후 복원
  const FILTER_STORAGE_KEY = "home-filter-type";
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY) as FilterType | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && FILTER_TYPES.includes(saved)) setFilterType(saved);
    } catch { /* 저장소 접근 실패 시 기본값 유지 */ }
  }, []);
  function changeFilter(next: FilterType) {
    setFilterType(next);
    try { localStorage.setItem(FILTER_STORAGE_KEY, next); } catch { /* 무시 */ }
  }
  const [selectedDate, setSelectedDate] = useState<string>(() => todayKST());
  const openingLock = useRef(false);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [compDetailInitialComments, setCompDetailInitialComments] = useState<CmntRow[] | undefined>(undefined);
  const [registrationsByCompetitionId, setRegistrationsByCompetitionId] =
    useState<Record<string, CompetitionRegistration>>(initialRegistrationsByCompetitionId);

  const memberStatus = initialMemberStatus;

  // 뷰어 파생값 — ready/inactive 둘 다 memberId 를 가지므로, 상세·댓글에 회원 식별자를
  // 넘겨 "보기는 열되"(비로그인 블러 방지), inactive 면 viewerInactive 로 쓰기만 차단한다.
  const viewerMemberId =
    memberStatus.status === "ready" || memberStatus.status === "inactive"
      ? memberStatus.memberId
      : undefined;
  const viewerInactive = memberStatus.status === "inactive";
  const viewerInactiveKind =
    memberStatus.status === "inactive" ? memberStatus.memberSt : undefined;

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

  // 등록 직후 전용: 조회 없이 즉시 상세를 연다.
  // 새 모임이라 댓글 0·참석자=작성자 1명·상세=폼 입력값으로 자명하므로 쿼리를 생략해
  // 등록→상세 오픈 사이의 직렬 대기(달력 재조회 + 상세 3쿼리)를 제거한다.
  const openGatheringDetailInstant = useCallback((race: CalendarRace & { maxPrtCnt?: number | null }) => {
    const me = memberStatus.status === "ready"
      ? [{ mem_id: memberStatus.memberId, mem_nm: memberStatus.fullName ?? null, avatar_url: memberAvatarUrl ?? null }]
      : [];
    gthrOpenReqRef.current += 1; // 진행 중이던 이전 상세 조회 무효화
    setGthrJustCreated(true);
    setGthrDetailRace({ ...race, regCount: me.length, maxPrtCnt: race.maxPrtCnt ?? null, attendees: me, sprt_cd: race.sprt_cd ?? null });
    setGthrDetailAttending(true); // 작성자는 자동 참석
    setGthrDetailLoading(false);   // 입력값으로 완결 — 스켈레톤 불필요
    setGthrDetailComments([]);     // 새 모임 — 댓글 없음
    setGthrDetailOpen(true);
  // memberStatus/memberAvatarUrl은 렌더마다 안정적
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberAvatarUrl]);

  const openGatheringDetail = useCallback(async (race: CalendarRace, justCreated = false) => {
    // 등록 직후 경로(justCreated)는 사용자 클릭과 무관하게 반드시 열어야 하므로 락을 무시한다
    if (openingLock.current && !justCreated) return;
    openingLock.current = true;
    const reqId = ++gthrOpenReqRef.current;
    // 등록 직후 경로만 공유 유도 안내를 켜고, 일반 클릭은 끈다
    setGthrJustCreated(justCreated);
    // 리스트/캘린더 행에 이미 있는 데이터(제목·일시·장소·비고·참석수·정원)로 즉시 연다.
    // 참석자 목록·내 참석 여부만 뒤에서 채우고, 그동안 다이얼로그가 스켈레톤을 그린다.
    setGthrDetailRace({ ...race, regCount: race.regCount ?? 0, maxPrtCnt: race.maxPrtCnt ?? null, attendees: [], sprt_cd: race.sprt_cd ?? null });
    setGthrDetailAttending(false);
    setGthrDetailComments(undefined);
    setGthrDetailLoading(true);
    setGthrDetailOpen(true);
    try {
      type GthrDetail = { max_prt_cnt: number | null; sprt_cd: string | null; attendees: GatheringAttendee[] };
      // 댓글은 함께 기다리지 않는다 — undefined로 넘기면 CommentSection이 스스로 조회·로딩 표시한다.
      const [attdResult, gthrDetailResult] = await Promise.all([
        memberId
          ? supabase.from("gthr_attd_rel").select("attd_id").eq("gthr_id", race.id).eq("mem_id", memberId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.rpc("get_gathering_detail", { p_gthr_id: race.id, p_team_id: teamId }),
      ]);
      if (gthrDetailResult.error) {
        // 이미 열린 다이얼로그는 유지 — 행 데이터만으로도 핵심 정보는 보인다
        console.error("[openGatheringDetail]", gthrDetailResult.error);
        return;
      }
      // 그 사이 다른 모임이 열렸으면(인스턴트 오픈·딥링크 등) 늦게 온 응답을 통째로 버린다
      if (reqId !== gthrOpenReqRef.current) return;
      const gthrData = gthrDetailResult.data as GthrDetail | null;
      const attendees: GatheringAttendee[] = gthrData?.attendees ?? [];
      setGthrDetailRace((prev) => prev && prev.id === race.id
        ? { ...prev, regCount: attendees.length, maxPrtCnt: gthrData?.max_prt_cnt ?? null, attendees, sprt_cd: gthrData?.sprt_cd ?? prev.sprt_cd ?? null }
        : prev);
      // 등록 직후(justCreated)엔 작성자가 자동 참석되므로 무조건 참석 상태로 확정한다.
      // (자동 참석 INSERT 직후라 attd 조회가 read-after-write 지연으로 null을 반환할 수 있어
      //  조회 결과만 믿으면 데스크톱처럼 빠른 환경에서 참석 토글이 꼬인다)
      setGthrDetailAttending(justCreated || !!attdResult.data);
    } finally {
      // 요청이 유효할 때만 로딩 해제 — 무효화된 요청이 새 오픈의 스켈레톤을 조기 종료하지 않게
      if (reqId === gthrOpenReqRef.current) setGthrDetailLoading(false);
      openingLock.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 알림 딥링크: /?post=<id> 또는 /?comp=<id>로 진입 시 해당 상세 자동 오픈
  const searchParams = useSearchParams()
  const deepLinkPostId = searchParams.get("post")
  const deepLinkCompId = searchParams.get("comp")
  const deepLinkGthrId = searchParams.get("gthr")

  useEffect(() => {
    // 언마운트·경로 이동·딥링크 교체 후 늦게 도착한 응답의 부수효과(특히 주소 덮어쓰기) 차단
    let cancelled = false
    if (deepLinkGthrId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deepLinkGthrId)
      const masterSelect = "gthr_id, short_id, gthr_nm, gthr_type_enm, stt_at, end_at, loc_txt, desc_txt, crt_by"

      if (isUuid) {
        // 알림·헤더칩 딥링크(uuid): 마스터+상세+참석을 병렬 1 RTT로 조회 후 완결 상태로 오픈.
        // (기존엔 마스터 조회 → 상세 조회 직렬 2 RTT)
        type GthrDetail = { max_prt_cnt: number | null; sprt_cd: string | null; attendees: GatheringAttendee[] }
        const reqId = ++gthrOpenReqRef.current
        Promise.all([
          supabase.from("gthr_mst").select(masterSelect).eq("gthr_id", deepLinkGthrId).maybeSingle(),
          supabase.rpc("get_gathering_detail", { p_gthr_id: deepLinkGthrId, p_team_id: teamId }),
          memberId
            ? supabase.from("gthr_attd_rel").select("attd_id").eq("gthr_id", deepLinkGthrId).eq("mem_id", memberId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]).then(([masterRes, detailRes, attdRes]) => {
          if (cancelled) return
          // 그 사이 다른 모임이 열렸으면 늦게 온 딥링크 응답을 버린다
          if (reqId !== gthrOpenReqRef.current) return
          const data = masterRes.data
          if (!data) {
            notifyDeepLinkMissing("모임")
            return
          }
          const gthrData = detailRes.data as GthrDetail | null
          const attendees: GatheringAttendee[] = gthrData?.attendees ?? []
          setGthrJustCreated(false)
          setGthrDetailRace({
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
            regCount: attendees.length,
            maxPrtCnt: gthrData?.max_prt_cnt ?? null,
            attendees,
            sprt_cd: gthrData?.sprt_cd ?? null,
          })
          setGthrDetailAttending(!!attdRes.data)
          setGthrDetailLoading(false)
          setGthrDetailComments(undefined)
          clearDeepLinkParams()
          setGthrDetailOpen(true)
        })
      } else {
        // 공유 링크(short_id): uuid를 몰라 마스터 조회가 선행 — 이후 즉시 오픈+스켈레톤으로 채움
        supabase.from("gthr_mst").select(masterSelect).eq("short_id", deepLinkGthrId).maybeSingle().then(({ data }) => {
          if (cancelled) return
          if (!data) {
            notifyDeepLinkMissing("모임")
            return
          }
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
          clearDeepLinkParams()
          openGatheringDetail(race)
        })
      }
    }
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkGthrId])

  useEffect(() => {
    // 언마운트·경로 이동·딥링크 교체 후 늦게 도착한 응답의 부수효과(특히 주소 덮어쓰기) 차단
    let cancelled = false
    if (deepLinkPostId) {
      // short_id로 먼저 조회, 없으면 UUID fallback (기존 알림 호환)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deepLinkPostId)
      const query = isUuid
        ? supabase.from("sch_post_mst").select("sch_post_id, short_id, sch_nm, post_type, evt_stt_at, evt_end_at, url, cont_txt, crt_by").eq("sch_post_id", deepLinkPostId).maybeSingle()
        : supabase.from("sch_post_mst").select("sch_post_id, short_id, sch_nm, post_type, evt_stt_at, evt_end_at, url, cont_txt, crt_by").eq("short_id", deepLinkPostId).maybeSingle()

      query.then(({ data }) => {
        if (cancelled) return
        if (!data) {
          notifyDeepLinkMissing("일정")
          return
        }
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
        // 댓글은 기다리지 않는다 — undefined면 CommentSection이 자체 조회·로딩 표시 (인스턴트 오픈 원칙)
        setSchDetailInitialComments(undefined)
        clearDeepLinkParams()
        setSchDetailOpen(true)
      })
    }

    if (deepLinkCompId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deepLinkCompId)
      const query = isUuid
        ? supabase.from("comp_mst").select("comp_id, short_id, comp_nm, comp_sprt_cd, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_type)").eq("comp_id", deepLinkCompId).maybeSingle()
        : supabase.from("comp_mst").select("comp_id, short_id, comp_nm, comp_sprt_cd, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_type)").eq("short_id", deepLinkCompId).maybeSingle()

      query.then(({ data }) => {
        if (cancelled) return
        if (!data) {
          notifyDeepLinkMissing("대회")
          return
        }
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
        // 댓글은 기다리지 않는다 — undefined면 CommentSection이 자체 조회·로딩 표시 (인스턴트 오픈 원칙)
        setCompDetailInitialComments(undefined)
        clearDeepLinkParams()
        setDetailOpen(true)
      })
    }
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkPostId, deepLinkCompId])

  const today = todayKST();
  const [yearStr, monthStr] = viewMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const totalDays = daysInMonth(year, month);
  const firstDayOfWeek = dayjs.tz(`${year}-${String(month).padStart(2, "0")}-01`, "Asia/Seoul").day();

  const allRaces = useMemo(() => [...myRaces, ...schPosts, ...gigangRaces, ...gatherings], [myRaces, schPosts, gigangRaces, gatherings]);

  const filteredRaces = useMemo(() => allRaces.filter((r) => matchesFilter(r, filterType)), [allRaces, filterType]);

  // 날짜별 이벤트 목록 (mine 우선, schedule, gigang 순) — 기간 이벤트는 모든 날짜에 전개
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarRace[]>();
    const seen = new Set<string>();
    for (const race of filteredRaces) {
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
  }, [filteredRaces]);

  // 주차별로 날짜 그룹핑 — 앞뒤 빈칸을 이전/다음 달 날짜로 채워 6주 그리드를 메운다.
  // inMonth=false 셀은 흐리게 표시하고, 클릭 시 해당 달로 전환한다.
  const weeks = useMemo(() => {
    // 그리드 첫 셀 = 이번 달 1일이 속한 주의 일요일
    const firstCell = dayjs
      .tz(`${year}-${String(month).padStart(2, "0")}-01`, "Asia/Seoul")
      .subtract(firstDayOfWeek, "day");
    // 이번 달 마지막날까지 채우는 데 필요한 주 수(가변). 최소 5주를 보장해 4주로 딱 떨어지는 달
    // (1일이 일요일인 평년 2월 등)에도 앞뒤 달 셀이 보이게 한다 — gridDateRange와 동일 기준.
    const weekCount = Math.max(5, Math.ceil((firstDayOfWeek + totalDays) / 7));
    const result: Cell[][] = [];
    for (let w = 0; w < weekCount; w++) {
      const week: Cell[] = [];
      for (let d = 0; d < 7; d++) {
        const cur = firstCell.add(w * 7 + d, "day");
        week.push({
          date: cur.format("YYYY-MM-DD"),
          day: cur.date(),
          inMonth: cur.month() + 1 === month && cur.year() === year,
        });
      }
      result.push(week);
    }
    return result;
  }, [year, month, firstDayOfWeek, totalDays]);

  // 주차별 스패닝 이벤트 레인 계산
  const weekEventLanes = useMemo(() => {
    return weeks.map((week) => {
      // 모든 셀이 날짜를 가지므로(앞뒤 달 포함) null 처리가 없다.
      const colDates = week.map((cell) => cell.date);
      const weekStart = colDates[0];
      const weekEnd = colDates[colDates.length - 1];

      const seen = new Set<string>();
      const active = filteredRaces.filter((race) => {
        if (seen.has(race.id)) return false;
        seen.add(race.id);
        const endStr = race.end_date ? dayjs(race.end_date).tz("Asia/Seoul").format("YYYY-MM-DD") : race.start_date;
        return race.start_date <= weekEnd && endStr >= weekStart;
      });

      const positioned = active.map((race) => {
        const endStr = race.end_date ? dayjs(race.end_date).tz("Asia/Seoul").format("YYYY-MM-DD") : race.start_date;
        let colStart = colDates.findIndex((d) => d >= race.start_date);
        if (colStart === -1) colStart = 0;
        let colEnd = colStart;
        for (let i = colStart + 1; i < 7; i++) {
          if (colDates[i] <= endStr) colEnd = i;
        }
        return {
          race,
          colStart,
          colSpan: colEnd - colStart + 1,
          startsThisWeek: race.start_date >= weekStart,
          endsThisWeek: endStr <= weekEnd,
        };
      });

      // 슬롯 배정 순서(하단 패널과 동일 우선순위 eventDisplayOrder):
      //  ① 참여중 ② 모임 ③ 정보 ④ 대회 → 윗 슬롯 우선권을 줘 위에 보이게 한다.
      //  ② 같은 우선순위 안에선 colStart(시작 날짜)순 → "겹치지 않으면 가장 위 빈 슬롯"이
      //     성립해, 자리가 있는데도 비는 일 없이 촘촘히 채워진다(긴 일정 먼저, colSpan 내림차순).
      // 짧은 일정이 위로 가며 그게 없는 날짜 칸의 윗줄이 비는 건, 그 칸에 다른 일정이 생기면
      // findIndex로 그 빈 슬롯을 채우므로 "자리가 필요한데 비는" 문제는 발생하지 않는다.
      const sorted = [...positioned].sort((a, b) =>
        eventDisplayOrder(a.race) - eventDisplayOrder(b.race) ||
        a.colStart - b.colStart ||
        b.colSpan - a.colSpan
      );

      // 슬롯 배정 — 우선순위 정렬로 늦게 시작하는 이벤트가 먼저 올 수 있으므로,
      // colStart 단조 증가를 가정한 단일 end 비교가 아니라 각 슬롯이 점유한 [start,end] 구간을
      // 모두 추적해 "겹치지 않는 가장 위 슬롯"을 찾는다. 겹치지 않으면 슬롯을 재사용해 불필요한
      // 슬롯 증가(→ 3개 제한 초과로 일정 숨김)를 막는다.
      const slotRanges: { start: number; end: number }[][] = [];
      const withSlot = sorted.map((ep) => {
        const epEnd = ep.colStart + ep.colSpan - 1;
        let slot = slotRanges.findIndex((ranges) =>
          ranges.every((r) => epEnd < r.start || ep.colStart > r.end),
        );
        if (slot === -1) { slot = slotRanges.length; slotRanges.push([]); }
        slotRanges[slot].push({ start: ep.colStart, end: epEnd });
        return { ...ep, slot };
      });

      // 렌더 순서는 무관(각자 grid-column/row로 절대배치)하므로 배정 결과를 그대로 반환
      return withSlot;
    });
  }, [weeks, filteredRaces]);

  const handleRaceClick = useCallback(async (race: CalendarRace) => {
    if (openingLock.current) return;
    openingLock.current = true;
    // 행에 이미 있는 데이터(제목·일시·장소)로 즉시 열고, 종목·공식링크 등 나머지만
    // 뒤에서 채운다(모임 openGatheringDetail과 동일한 인스턴트 오픈 패턴).
    // 댓글도 기다리지 않는다 — undefined면 CommentSection이 자체 조회·로딩 표시.
    setSelectedCompetition({
      id: race.id,
      short_id: race.short_id ?? null,
      external_id: "",
      sport: null,
      title: race.title,
      start_date: race.start_date,
      end_date: race.end_date ?? null,
      location: race.location ?? null,
      event_types: null,
      source_url: null,
    });
    setCompDetailInitialComments(undefined);
    setDetailOpen(true);
    try {
      const { data } = await supabase
        .from("comp_mst")
        .select("comp_id, short_id, comp_nm, comp_sprt_cd, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_type)")
        .eq("comp_id", race.id)
        .single();
      if (!data) return;
      // 그 사이 다른 대회가 열렸으면 늦게 온 응답을 버린다
      setSelectedCompetition((prev) => prev && prev.id === race.id
        ? {
            ...prev,
            short_id: data.short_id ?? null,
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
        : prev);
    } finally {
      openingLock.current = false;
    }
  // supabase/memberId/teamId는 컴포넌트 생애 내 불변
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // 낙관적 UI: gigangRaces → myRaces 즉시 이동 + regCount 증가
    setGigangRaces((prev) => prev.map((r) => r.id === competitionId ? { ...r, regCount: (r.regCount ?? 0) + 1 } : r));
    setMyRaces((prev) => {
      if (prev.some((r) => r.id === competitionId)) return prev;
      const source = gigangRaces.find((r) => r.id === competitionId);
      if (!source) return prev;
      return [...prev, { ...source, type: "mine" as const, regCount: (source.regCount ?? 0) + 1 }];
    });
    void refreshMonthData();
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
    void refreshMonthData();
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
    // 낙관적 UI: myRaces에서 제거 + gigangRaces regCount 감소
    setMyRaces((prev) => prev.filter((r) => r.id !== competitionId));
    setGigangRaces((prev) => prev.map((r) => r.id === competitionId ? { ...r, regCount: Math.max(0, (r.regCount ?? 1) - 1) } : r));
    void refreshMonthData();
    return { ok: true as const, message: "취소 완료" };
  };

  async function fetchMonthData(newMonth: string) {
    const [yStr, mStr] = newMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    // 그리드에 실제 그려지는 범위(이전 달 며칠 ~ 다음 달 며칠)로 조회해 앞뒤 달 일정도 함께 표시한다.
    // fetchStart는 start보다 1주 앞 — 그리드 시작 직전에 시작해 그리드 안으로 이어지는 일정 누락 방지.
    const { start: gridStart, end: gridEnd, fetchStart } = gridDateRange(y, m);

    const [
      { data: teamComps },
      myRegsResult,
      { data: schPostRows },
      { data: gthrRows },
    ] = await Promise.all([
      supabase.rpc("get_public_team_competitions", { p_team_id: teamId, p_start: fetchStart, p_end: gridEnd }),
      memberId
        ? supabase
            .from("comp_reg_rel")
            .select("team_comp_plan_rel!inner(comp_id, comp_mst!inner(comp_id, comp_nm, stt_dt, loc_nm))")
            .eq("mem_id", memberId)
            .eq("team_comp_plan_rel.team_id", teamId)
            .eq("vers", 0)
            .eq("del_yn", false)
        : Promise.resolve({ data: null }),
      supabase.rpc("get_public_team_sch_posts", { p_team_id: teamId, p_start: fetchStart, p_end: gridEnd }),
      memberId
        ? supabase.rpc("get_public_team_gatherings", { p_team_id: teamId, p_start: fetchStart, p_end: gridEnd, p_mem_id: memberId })
        : supabase.rpc("get_public_team_gatherings", { p_team_id: teamId, p_start: fetchStart, p_end: gridEnd }),
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
          return race.start_date >= gridStart && race.start_date <= gridEnd ? [race] : [];
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
      sprt_cd: row.sprt_cd ?? null,
      location: row.loc_txt ?? null,
      cont_txt: row.desc_txt ?? null,
      evt_stt_at: row.stt_at,
      evt_end_at: row.end_at ?? null,
      crt_by: row.crt_by,
      crt_by_nm: row.crt_by_nm ?? null,
      regCount: row.attd_count ? Number(row.attd_count) : 0,
      maxPrtCnt: row.max_prt_cnt ?? null,
      cmntCount: row.cmnt_count ? Number(row.cmnt_count) : undefined,
    }));

    return { gigang: newGigang, mine: newMine, schPosts: newSchPosts, gatherings: newGatherings };
  }

  const viewMonthRef = useRef(viewMonth);
  useEffect(() => { viewMonthRef.current = viewMonth; }, [viewMonth]);

  const fetchMonthDataRef = useRef(fetchMonthData);
  useEffect(() => { fetchMonthDataRef.current = fetchMonthData; });

  // 인접 달(prev/next) 프리페치 — 캐시에 없는 달만 백그라운드로 조회
  const prefetchAdjacent = useCallback((monthFirst: string) => {
    const version = cacheVersionRef.current;
    const prev = dayjs(monthFirst).subtract(1, "month").format("YYYY-MM-01");
    const next = dayjs(monthFirst).add(1, "month").format("YYYY-MM-01");
    for (const m of [prev, next]) {
      if (!monthCacheRef.current.has(m)) {
        fetchMonthDataRef.current(m).then((data) => {
          if (version === cacheVersionRef.current) {
            monthCacheRef.current.set(m, data);
          }
        }).catch(() => { /* 프리페치 실패는 무시 */ });
      }
    }
  }, []);

  // 월 데이터를 적용하는 헬퍼
  const applyMonthData = useCallback((data: MonthData) => {
    setGigangRaces(data.gigang);
    setMyRaces(data.mine);
    setSchPosts(data.schPosts);
    setGatherings(data.gatherings);
  }, []);

  // 특정 월(YYYY-MM-01)로 이동하며 데이터를 교체. 흐린 다른 달 셀 클릭 시에도 재사용한다.
  const goToMonth = useCallback((monthFirst: string) => {
    if (openingLock.current) return;
    if (monthFirst === viewMonthRef.current) return;
    setViewMonth(monthFirst);

    // 캐시 히트 — 즉시 반영 (isPending 없이 전환)
    const cached = monthCacheRef.current.get(monthFirst);
    if (cached) {
      applyMonthData(cached);
      prefetchAdjacent(monthFirst);
      return;
    }

    // 캐시 미스 — 조회 중 isPending으로 흐림 처리
    startTransition(async () => {
      const version = cacheVersionRef.current;
      const data = await fetchMonthDataRef.current(monthFirst);
      if (version !== cacheVersionRef.current) return;
      monthCacheRef.current.set(monthFirst, data);
      if (viewMonthRef.current !== monthFirst) return;
      applyMonthData(data);
      prefetchAdjacent(monthFirst);
    });
  // applyMonthData·prefetchAdjacent는 deps [] 로 안정화됨
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((dir: -1 | 1) => {
    goToMonth(dayjs(viewMonthRef.current).add(dir, "month").format("YYYY-MM-01"));
  // goToMonth는 deps [] 로 안정화됨
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSR(page.tsx)이 처음부터 gridDateRange 범위로 공개 데이터를 조회해 내려주므로 공개 데이터 보강 재조회는 불필요하다.
  // 다만 유저별 데이터(내 대회 등록, 모임 참석 여부)는 캐시에 포함되지 않으므로 마운트 시 클라이언트에서 fetch한다.
  // (달 이동 시에는 fetchMonthData가 유저별 데이터를 함께 조회하므로 이 useEffect는 초기 마운트 1회만 필요.)
  useEffect(() => {
    if (!memberId) return;
    const memId = memberId; // TypeScript narrowing — async 함수 내에서 non-optional 사용

    async function fetchUserData() {
      const [yStr, mStr] = initialMonth.split("-");
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const { start: gridStart, end: gridEnd, fetchStart } = gridDateRange(y, m);

      const [{ data: myRegs }, { data: gthrWithAttd }] = await Promise.all([
        // 내 대회 등록 — 등록 상세 필드 포함 (CompetitionDetailDialog에서 수정/취소에 필요)
        supabase
          .from("comp_reg_rel")
          .select(
            "comp_reg_id, mem_id, prt_role_cd, crt_at, team_comp_plan_rel!inner(comp_id, comp_mst!inner(comp_id, comp_nm, stt_dt, loc_nm, comp_sprt_cd, comp_evt_cfg(comp_evt_type))), comp_evt_cfg(comp_evt_type)",
          )
          .eq("mem_id", memId)
          .eq("team_comp_plan_rel.team_id", teamId)
          .eq("vers", 0)
          .eq("del_yn", false),
        // 모임 참석 여부
        supabase.rpc("get_public_team_gatherings", {
          p_team_id: teamId,
          p_start: fetchStart,
          p_end: gridEnd,
          p_mem_id: memId,
        }),
      ]);

      // 월 이동이 발생했으면 늦게 온 응답을 버린다
      if (viewMonthRef.current !== initialMonth) return;

      // myRaces + registrationsByCompetitionId 구성
      if (myRegs) {
        const races = myRegs.flatMap((r) => {
          const plan = Array.isArray(r.team_comp_plan_rel)
            ? r.team_comp_plan_rel[0]
            : r.team_comp_plan_rel;
          const comp = Array.isArray(plan?.comp_mst) ? plan.comp_mst[0] : plan?.comp_mst;
          if (!comp) return [];
          const race: CalendarRace = {
            id: comp.comp_id,
            title: comp.comp_nm,
            start_date: comp.stt_dt,
            type: "mine",
            location: comp.loc_nm ?? null,
          };
          return race.start_date >= gridStart && race.start_date <= gridEnd ? [race] : [];
        });
        setMyRaces(races);

        // 등록 맵 구성 — 대회 클릭 시 수정/취소 흐름에 필요
        const regs: Record<string, CompetitionRegistration> = {};
        myRegs.forEach((r) => {
          const plan = Array.isArray(r.team_comp_plan_rel)
            ? r.team_comp_plan_rel[0]
            : r.team_comp_plan_rel;
          regs[plan.comp_id] = {
            id: r.comp_reg_id,
            competition_id: plan.comp_id,
            member_id: r.mem_id,
            role: r.prt_role_cd as CompetitionRegistration["role"],
            event_type:
              (Array.isArray(r.comp_evt_cfg) ? r.comp_evt_cfg[0] : r.comp_evt_cfg)
                ?.comp_evt_type?.toUpperCase() ?? null,
            created_at: r.crt_at,
          } as CompetitionRegistration;
        });
        setRegistrationsByCompetitionId(regs);
      }

      // gathering is_attending overlay — 서버에서 "gathering"으로만 내려온 데이터에 참석 여부를 overlay
      if (gthrWithAttd) {
        setGatherings((prev) =>
          prev.map((g) => {
            const match = gthrWithAttd.find(
              (row: { gthr_id: string; is_attending?: boolean }) => row.gthr_id === g.id,
            );
            if (match && match.is_attending) {
              return { ...g, type: "gathering_mine" as const };
            }
            return g;
          }),
        );
      }
    }

    fetchUserData();
  // initialMonth·supabase·teamId는 마운트 후 변경되지 않으며, memberId 변경 시에만 재실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  // 마운트 시 인접 달 프리페치 시작
  useEffect(() => {
    prefetchAdjacent(initialMonth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const swipeTouchStartX = useRef<number | null>(null);
  const swipeDidNavigate = useRef(false);
  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    swipeTouchStartX.current = e.touches[0].clientX;
    swipeDidNavigate.current = false;
  }, []);
  const handleSwipeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (swipeTouchStartX.current === null || isPending) return;
    const dx = e.changedTouches[0].clientX - swipeTouchStartX.current;
    swipeTouchStartX.current = null;
    if (Math.abs(dx) < 75) return;
    swipeDidNavigate.current = true;
    navigate(dx < 0 ? 1 : -1);
  // navigate는 deps [] 로 안정화됨
  }, [isPending, navigate]);  

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

  function handlePickedCompetition(competition: Competition) {
    setSelectedCompetition(competition);
    // 댓글은 기다리지 않는다 — undefined면 CommentSection이 자체 조회·로딩 표시 (인스턴트 오픈 원칙)
    setCompDetailInitialComments(undefined);
    setDetailOpen(true);
  }

  async function handleCompetitionCreated(competition: Competition) {
    setCompDetailInitialComments([]);
    setSelectedCompetition(competition);
    setDetailOpen(true);
    await handleSchPostSuccess();
  }

  const openSchPostDetail = useCallback((race: CalendarRace) => {
    // 정보 상세는 race 외에 추가로 조회할 본문이 없다.
    // 댓글도 함께 기다리지 않고 undefined로 넘겨(CommentSection 자체 조회) 즉시 연다.
    setSchDetailPost(race);
    setSchDetailInitialComments(undefined);
    setSchDetailOpen(true);
  }, []);

  async function refreshMonthData() {
    const monthFirst = viewMonthRef.current;
    cacheVersionRef.current += 1;
    const version = cacheVersionRef.current;
    monthCacheRef.current.clear();
    const data = await fetchMonthDataRef.current(monthFirst);
    if (version !== cacheVersionRef.current) return data;
    monthCacheRef.current.set(monthFirst, data);
    if (viewMonthRef.current === monthFirst) {
      applyMonthData(data);
      setListViewKey((k) => k + 1);
      prefetchAdjacent(monthFirst);
    }
    return data;
  }

  async function handleSchPostSuccess() {
    await refreshMonthData();
  }

  /** 주간 일정을 단톡방 공유용 텍스트로 조립해 공유 시트를 연다.
      기준 주는 캘린더뷰=선택 날짜, 리스트뷰=오늘. 필터 칩도 그대로 반영. */
  function openWeeklyShare() {
    // 월 이동(화살표/스와이프)은 selectedDate를 안 바꾸므로, 선택 날짜가 보고 있는 달
    // 밖이면 그 달 1일을 기준으로 — 로드된 데이터(현재 달)와 기준 주가 어긋나는 것 방지
    const calendarBase =
      selectedDate.slice(0, 7) === viewMonth.slice(0, 7) ? selectedDate : viewMonth;
    const text = buildWeeklyShareText(
      [...myRaces, ...schPosts, ...gigangRaces, ...gatherings],
      window.location.origin,
      filterType,
      view === "calendar" ? calendarBase : today,
    );
    if (!text) {
      toast.info("해당 주에 남은 일정이 없어요.");
      return;
    }
    setWeeklyShareText(text);
    setWeeklyShareOpen(true);
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
          {/* 주간 일정 공유 — 이번 주 일정을 텍스트로 단톡방에 붙여넣기 */}
          <button
            onClick={openWeeklyShare}
            aria-label="주간 일정 공유"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Share2 className="size-3.5" />
          </button>
        </div>


        {/* 월 네비게이션 — 캘린더뷰에서만 표시 */}
        {view === "calendar" && (
          <div className="flex items-center gap-1">
            <SectionLabel className="tabular-nums text-foreground">
              {year}.{String(month).padStart(2, "0")}
            </SectionLabel>
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

      {/* 필터 칩 — "내 일정"(참가 대회·참석 모임)은 멤버일 때만 노출.
          이모지는 ⭐(내 일정 구분용)만 유지 — 5개 칩이 360px 한 줄에 들어가도록 폭 절약 */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-0.5">
        {([
          { key: "all", label: "전체" },
          ...(memberId ? [{ key: "mine", label: "⭐ 내 일정" }] as const : []),
          { key: "competition", label: "대회" },
          { key: "schedule", label: "정보" },
          { key: "gathering", label: "모임" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => changeFilter(key)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors",
              filterType === key
                ? "bg-foreground text-background font-medium"
                : "border border-border bg-transparent text-muted-foreground hover:border-foreground/40"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "calendar" ? (
        <>
          {/* 달력 + 이벤트 */}
          <div
            className={cn("flex flex-col transition-opacity", isPending && "opacity-50")}
            onTouchStart={handleSwipeTouchStart}
            onTouchEnd={handleSwipeTouchEnd}
          >
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
                      {week.map((cell) => {
                        const dateStr = cell.date;
                        const isSelected = selectedDate === dateStr;
                        return (
                          <button
                            key={`ol-${dateStr}`}
                            onClick={() => {
                              if (swipeDidNavigate.current) { swipeDidNavigate.current = false; return; }
                              setSelectedDate(dateStr);
                              // 흐린 다른 달 셀이면 해당 달로 전환(데이터도 그 달 기준으로 재조회)
                              if (!cell.inMonth) goToMonth(dayjs(dateStr).format("YYYY-MM-01"));
                            }}
                            className={cn(
                              "pointer-events-auto h-full w-full transition-colors",
                              isSelected && "bg-secondary/60",
                            )}
                            aria-label={`${cell.day}일 선택`}
                            aria-pressed={isSelected}
                          />
                        );
                      })}
                    </div>

                    {/* 날짜 숫자 행 (표시 전용) — 다른 달 셀은 흐리게 */}
                    <div className="relative z-10 grid grid-cols-7" style={{ pointerEvents: "none" }}>
                      {week.map((cell, colIdx) => {
                        const dateStr = cell.date;
                        const isToday = dateStr === today;
                        const outMonth = !cell.inMonth;
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
                                  // 다른 달: 평일/주말 색을 흐리게 통일
                                  !isToday && outMonth && "text-muted-foreground/40",
                                  !isToday && !outMonth && colIdx === 0 && "text-destructive",
                                  !isToday && !outMonth && colIdx === 6 && "text-primary",
                                  !isToday && !outMonth && colIdx !== 0 && colIdx !== 6 && "text-foreground",
                                )}
                              >
                                {cell.day}
                              </span>
                              {overflowCount > 0 && (
                                <span className={cn(
                                  "text-[8px] font-medium leading-none",
                                  outMonth ? "text-muted-foreground/40" : "text-muted-foreground",
                                )}>
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
                      {visibleLanes.map((lane) => {
                        // lane이 점유한 칸이 전부 다른 달이면 흐리게(이번 달 셀에 하나라도 걸치면 정상 표시)
                        const outMonth = !week
                          .slice(lane.colStart, lane.colStart + lane.colSpan)
                          .some((c) => c.inMonth);
                        return (
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
                              outMonth && "opacity-40",
                              lane.race.type === "mine"
                                ? "bg-warning/60 text-white"
                                : lane.race.type === "schedule"
                                  ? "bg-info/15 text-info"
                                  : lane.race.type === "gathering_mine"
                                    ? "bg-violet-500/60 text-white"
                                    : lane.race.type === "gathering"
                                      ? "bg-violet-500/20 text-violet-600"
                                      : "bg-warning/15 text-warning",
                            )}
                          >
                            {lane.startsThisWeek ? lane.race.title : ""}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 날짜 패널 — 항상 표시, 클릭으로 날짜 변경 */}
          {(() => {
            // 정렬: ① 참여중 ② 모임 ③ 정보 ④ 대회 (그리드 이벤트 바와 동일 eventDisplayOrder)
            // 같은 우선순위 안에서는 시작 시간(없으면 날짜) 순으로
            const panelTime = (r: CalendarRace): string => r.evt_stt_at ?? r.start_date;
            const panelRaces = [...(eventsByDate.get(selectedDate) ?? [])].sort(
              (a, b) => eventDisplayOrder(a) - eventDisplayOrder(b) || panelTime(a).localeCompare(panelTime(b)),
            );
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
                            race.type === "schedule" ? "bg-info"
                              : isGathering ? "bg-violet-500"
                              : "bg-warning",
                          )}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[11px] font-medium text-foreground">
                              {race.title}
                              {race.type === "schedule" && race.post_type && schPostTypeInlineLabel[race.post_type as SchPostType] && (
                                <span className="font-normal text-muted-foreground"> · {schPostTypeInlineLabel[race.post_type as SchPostType]}</span>
                              )}
                            </span>
                            {isGathering && (race.post_type === "regular" || race.post_type === "event") && (
                              <span className="shrink-0 rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 py-px text-[9px] font-medium leading-tight text-violet-400">
                                {race.post_type === "regular" ? "정기" : "이벤트"}
                              </span>
                            )}
                            {isGathering && <SportTag sprtCd={race.sprt_cd} />}
                          </span>
                          {isComp && (race.location || (race.cmntCount ?? 0) > 0) && (
                            <Micro className="flex items-center gap-1 text-muted-foreground">
                              {race.location && <span className="truncate">{race.location}</span>}
                              {(race.cmntCount ?? 0) > 0 && <span>💬 {race.cmntCount}</span>}
                            </Micro>
                          )}
                          {(race.type === "schedule" || isGathering) && (race.evt_stt_at || (race.cmntCount ?? 0) > 0) && (
                            <Micro className="flex items-center gap-1 text-muted-foreground tabular-nums">
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
                            </Micro>
                          )}
                          {/* 모임 장소 — 리스트뷰처럼 시간 줄과 분리해 별도 줄로 */}
                          {isGathering && race.location && (
                            <Micro className="truncate text-muted-foreground">{race.location}</Micro>
                          )}
                        </span>
                        {isComp && (race.regCount ?? 0) > 0 && (
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{race.regCount}명</span>
                        )}
                        {isGathering && (race.regCount ?? 0) > 0 && (
                          // 정원이 있으면 "5/10명", 없으면 기존처럼 "5명". 마감이면 색으로 구분.
                          <span
                            className={cn(
                              "shrink-0 text-[10px] tabular-nums",
                              race.maxPrtCnt != null && (race.regCount ?? 0) >= race.maxPrtCnt
                                ? "font-medium text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {race.maxPrtCnt != null ? `${race.regCount}/${race.maxPrtCnt}명` : `${race.regCount}명`}
                          </span>
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
                                : "border-violet-500/40 bg-violet-500/10 text-violet-400",
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
            filterType={filterType}
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

      {/* 주간 일정 공유 시트 */}
      <ShareSheet
        open={weeklyShareOpen}
        onOpenChange={setWeeklyShareOpen}
        headerTitle="주간 일정 공유하기"
        title="이번 주 기강 일정"
        timeLabel=""
        shareText={weeklyShareText}
      />

      {/* 모임 폼 다이얼로그 (등록 + 수정 겸용) */}
      <GatheringFormDialog
        open={gthrFormOpen}
        onOpenChange={(v) => { setGthrFormOpen(v); if (!v) { setGthrEditTarget(null); setGthrPrefill(null); } }}
        mode={gthrEditTarget ? "edit" : "create"}
        defaultDate={!gthrEditTarget ? gthrDefaultDate : undefined}
        prefill={!gthrEditTarget ? gthrPrefill ?? undefined : undefined}
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
        onSuccess={(createdGthrId, createdRace) => {
          setGthrEditTarget(null);
          // 신규 등록이면 폼이 넘겨준 데이터로 상세를 "즉시" 연다(조회 대기 없음).
          // 새 모임이라 댓글 0·참석자=작성자 1명·상세=입력값으로 자명하므로 쿼리를 생략한다.
          if (createdGthrId && createdRace) {
            openGatheringDetailInstant(createdRace);
          }
          // 달력 갱신은 await하지 않고 백그라운드로 — 상세 오픈을 막지 않는다.
          void refreshMonthData();
        }}
      />

      {/* 모임 상세 다이얼로그 */}
      <GatheringDetailDialog
        gathering={gthrDetailRace}
        open={gthrDetailOpen}
        onOpenChange={setGthrDetailOpen}
        teamId={teamId}
        currentMemberId={viewerMemberId}
        viewerInactive={viewerInactive}
        viewerInactiveKind={viewerInactiveKind}
        currentMemberName={memberStatus.status === "ready" ? memberStatus.fullName : undefined}
        currentMemberAvatarUrl={memberStatus.status === "ready" ? memberAvatarUrl : undefined}
        isAdmin={memberStatus.status === "ready" ? memberStatus.admin : false}
        isAttending={gthrDetailAttending}
        detailLoading={gthrDetailLoading}
        members={membersCache ?? []}
        initialComments={gthrDetailComments}
        justCreated={gthrJustCreated}
        onEdit={() => {
          if (!gthrDetailRace) return;
          setGthrDetailOpen(false);
          setGthrEditTarget(gthrDetailRace);
          setGthrFormOpen(true);
        }}
        onClone={() => {
          if (!gthrDetailRace) return;
          setGthrDetailOpen(false);
          setGthrPrefill({
            gthr_nm: gthrDetailRace.title,
            gthr_type_enm: gthrDetailRace.post_type ?? "general",
            sprt_cd: gthrDetailRace.sprt_cd ?? null,
            loc_txt: gthrDetailRace.location ?? null,
            desc_txt: gthrDetailRace.cont_txt ?? null,
            max_prt_cnt: gthrDetailRace.maxPrtCnt ?? null,
          });
          // 일시는 복사하지 않음 — 캘린더뷰면 선택 날짜, 리스트뷰면 오늘 기준 기본값
          setGthrDefaultDate(view === "calendar" ? selectedDate : today);
          setGthrFormOpen(true);
        }}
        onDelete={refreshMonthData}
        onAttendanceChange={async () => {
          type GthrDetail = { max_prt_cnt: number | null; sprt_cd: string | null; attendees: GatheringAttendee[] };
          const [, gthrDetailResult, attdResult] = await Promise.all([
            refreshMonthData(),
            gthrDetailRace
              ? supabase.rpc("get_gathering_detail", { p_gthr_id: gthrDetailRace.id, p_team_id: teamId })
              : Promise.resolve({ data: null, error: null }),
            gthrDetailRace && memberId
              ? supabase.from("gthr_attd_rel").select("attd_id").eq("gthr_id", gthrDetailRace.id).eq("mem_id", memberId).maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
          if (gthrDetailRace && gthrDetailResult.data) {
            const gthrData = gthrDetailResult.data as GthrDetail;
            const attendees: GatheringAttendee[] = gthrData.attendees ?? [];
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
        currentMemberId={viewerMemberId}
        viewerInactive={viewerInactive}
        viewerInactiveKind={viewerInactiveKind}
        currentMemberName={memberStatus.status === "ready" ? memberStatus.fullName : undefined}
        currentMemberAvatarUrl={memberStatus.status === "ready" ? memberAvatarUrl : undefined}
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
        onSuccess={() => { void refreshMonthData(); }}
      />

      {/* 대회 상세 다이얼로그 */}
      <CompetitionDetailDialog
        cmmCdRows={cmmCdRows}
        teamId={teamId}
        competition={selectedCompetition}
        registration={selectedCompetition ? registrationsByCompetitionId[selectedCompetition.id] : undefined}
        memberStatus={memberStatus}
        memberAvatarUrl={memberAvatarUrl}
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
