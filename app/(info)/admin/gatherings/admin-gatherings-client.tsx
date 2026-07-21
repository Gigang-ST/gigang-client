"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CalendarDays, ChevronLeft, ChevronRight, ChevronsUpDown, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";

import { currentMonthKST, dayjs, nextMonthStr, prevMonthStr } from "@/lib/dayjs";
import { deriveCanceledAttendees } from "@/lib/gathering/derive-canceled-attendees";
import { createClient } from "@/lib/supabase/client";
import { gthrTypeLabels, type GthrType } from "@/lib/validations/gathering";

import {
  addGatheringAttendance,
  removeGatheringAttendance,
} from "@/app/actions/admin/manage-gathering-attendance";

import { Avatar } from "@/components/common/avatar";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { H2, Body, Caption, Micro } from "@/components/common/typography";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

type Gathering = {
  gthr_id: string;
  gthr_nm: string;
  gthr_type_enm: string;
  stt_at: string;
  loc_txt: string | null;
  attd_count: number;
};

type Attendee = {
  mem_id: string;
  mem_nm: string | null;
  avatar_url: string | null;
};

type ActiveMember = {
  mem_id: string;
  mem_nm: string | null;
  avatar_url: string | null;
};

/** 취소 이력 간단 노출용 (SG-03 §4, 선택 범위). 사유 포함 팀 멤버 전체 공개 정책과 동일하게 관리자 화면에도 노출. */
type CanceledAttendee = {
  mem_id: string;
  mem_nm: string | null;
  avatar_url: string | null;
  evt_at: string;
  reason_txt: string | null;
};

/** 모임 타입 배지 스타일 — 시맨틱 토큰만 사용 (하드코딩 색 금지). */
const TYPE_BADGE_CLASS: Record<string, string> = {
  regular: "border-transparent bg-primary/10 text-primary",
  event: "border-transparent bg-warning/10 text-warning",
  general: "border-transparent bg-muted text-muted-foreground",
};

export function AdminGatheringsClient({ teamId }: { teamId: string }) {
  const [month, setMonth] = useState(() => currentMonthKST());
  const [gatherings, setGatherings] = useState<Gathering[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Gathering | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [canceledAttendees, setCanceledAttendees] = useState<CanceledAttendee[]>([]);
  const [canceledLoading, setCanceledLoading] = useState(false);

  const [activeMembers, setActiveMembers] = useState<ActiveMember[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingMemId, setRemovingMemId] = useState<string | null>(null);

  const monthLabel = dayjs(month).format("YYYY년 M월");

  // 월 이동 stale-response 가드 — 응답 도착 시점의 month가 요청 시점과 다르면(빠른 연속 이동) 무시한다.
  const latestMonthRequestRef = useRef<string>(month);

  // 참가자 다이얼로그 가드 — 모임 A를 열자마자 닫고 B를 열면 A의 늦은 응답/실패 롤백이
  // B 화면을 덮을 수 있다. 현재 열린 모임 id를 ref로 추적해 다르면 상태 반영을 건너뛴다.
  const currentGthrRef = useRef<string | null>(null);

  const loadGatherings = useCallback(async (targetMonth: string) => {
    latestMonthRequestRef.current = targetMonth;
    setLoading(true);
    const supabase = createClient();
    const monthStartIso = dayjs.tz(targetMonth, "Asia/Seoul").toISOString();
    const monthEndIso = dayjs.tz(nextMonthStr(targetMonth), "Asia/Seoul").toISOString();

    const { data } = await supabase
      .from("gthr_mst")
      .select("gthr_id, gthr_nm, gthr_type_enm, stt_at, loc_txt, gthr_attd_rel(count)")
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .gte("stt_at", monthStartIso)
      .lt("stt_at", monthEndIso)
      .order("stt_at", { ascending: true });

    // 응답 도착 시점에 이미 다른 달로 이동했다면 이 응답은 버린다 (더 빠른 요청이 늦게 도착하는 경우 대비).
    if (latestMonthRequestRef.current !== targetMonth) return;

    setGatherings(
      (data ?? []).map((g) => ({
        gthr_id: g.gthr_id,
        gthr_nm: g.gthr_nm,
        gthr_type_enm: g.gthr_type_enm,
        stt_at: g.stt_at,
        loc_txt: g.loc_txt,
        attd_count: (g.gthr_attd_rel as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
      })),
    );
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGatherings(month);
  }, [loadGatherings, month]);

  const loadAttendees = useCallback(async (gthrId: string) => {
    setAttendeesLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("gthr_attd_rel")
      .select("mem_id, mem_mst(mem_id, mem_nm, avatar_url)")
      .eq("gthr_id", gthrId);

    if (currentGthrRef.current !== gthrId) return; // 다른 모임으로 전환됨 — 늦은 응답 폐기

    setAttendees(
      (data ?? []).map((row) => {
        const m = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
        return {
          mem_id: row.mem_id,
          mem_nm: m?.mem_nm ?? null,
          avatar_url: m?.avatar_url ?? null,
        };
      }),
    );
    setAttendeesLoading(false);
  }, []);

  /**
   * 취소 이력 간단 노출(SG-03 §4, 선택 범위). gthr_attd_hist RLS가 팀 멤버 SELECT를 허용하므로
   * 관리자 브라우저 클라이언트(RLS)로도 그대로 조회 가능. 현재 rel(재참석 여부)은 이 다이얼로그
   * 안에서 별도로 최소 조회해, loadAttendees 상태(state)와의 타이밍 경쟁 없이 판정한다.
   */
  const loadCancelHistory = useCallback(async (gthrId: string) => {
    setCanceledLoading(true);
    const supabase = createClient();
    const [{ data: relRows }, { data: histRows }] = await Promise.all([
      supabase.from("gthr_attd_rel").select("mem_id").eq("gthr_id", gthrId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("gthr_attd_hist")
        .select("mem_id, evt_cd, evt_at, reason_txt, mem_mst(mem_id, mem_nm, avatar_url)")
        .eq("gthr_id", gthrId),
    ]);

    if (currentGthrRef.current !== gthrId) return; // 다른 모임으로 전환됨 — 늦은 응답 폐기

    const attendingIds = new Set((relRows ?? []).map((r: { mem_id: string }) => r.mem_id));
    setCanceledAttendees(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deriveCanceledAttendees(histRows ?? [], attendingIds).map((h: any) => {
        const m = Array.isArray(h.mem_mst) ? h.mem_mst[0] : h.mem_mst;
        return {
          mem_id: h.mem_id,
          mem_nm: m?.mem_nm ?? null,
          avatar_url: m?.avatar_url ?? null,
          evt_at: h.evt_at,
          reason_txt: h.reason_txt,
        };
      }),
    );
    setCanceledLoading(false);
  }, []);

  const loadActiveMembers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("team_mem_rel")
      .select("mem_id, mem_mst!inner(mem_id, mem_nm, avatar_url)")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "active")
      .eq("mem_mst.vers", 0)
      .eq("mem_mst.del_yn", false);

    setActiveMembers(
      (data ?? []).map((row) => {
        const m = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
        return {
          mem_id: row.mem_id,
          mem_nm: m?.mem_nm ?? null,
          avatar_url: m?.avatar_url ?? null,
        };
      }),
    );
  }, [teamId]);

  const openGathering = (g: Gathering) => {
    currentGthrRef.current = g.gthr_id;
    setSelected(g);
    setDialogOpen(true);
    loadAttendees(g.gthr_id);
    loadActiveMembers();
    loadCancelHistory(g.gthr_id);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      currentGthrRef.current = null; // 닫힌 뒤 도착하는 응답/롤백 무효화
      setCanceledAttendees([]); // 다음 모임 열 때 이전 취소 이력이 잠깐 보이는 걸 방지
    }
  };

  const attendeeIds = useMemo(() => new Set(attendees.map((a) => a.mem_id)), [attendees]);
  const availableMembers = useMemo(
    () => activeMembers.filter((m) => !attendeeIds.has(m.mem_id)),
    [activeMembers, attendeeIds],
  );

  const syncGatheringCount = (gthrId: string, delta: number) => {
    setGatherings((prev) =>
      prev.map((g) => (g.gthr_id === gthrId ? { ...g, attd_count: g.attd_count + delta } : g)),
    );
  };

  const handleRemoveAttendee = async (memId: string) => {
    if (!selected || removingMemId) return;
    const gthrId = selected.gthr_id;
    const target = attendees.find((a) => a.mem_id === memId);
    const memName = target?.mem_nm ?? "이름 없음";
    const gDate = dayjs(selected.stt_at).tz("Asia/Seoul").format("M/D(ddd)");
    // 관리자 취소도 사유를 남길 수 있게 — 프롬프트 취소(null)면 중단, 비워두면 사유 없이 진행.
    // 입력한 사유는 취소 이력에 저장되고 팀 멤버에게 공개된다(멤버 취소와 동일 정책).
    const reason = window.prompt(
      `${memName}님의 ${gDate} "${selected.gthr_nm}" 참석을 취소합니다.\n취소 사유를 남길 수 있어요 (선택):`,
      "",
    );
    if (reason === null) return;

    setRemovingMemId(memId);
    const prevAttendees = attendees;
    setAttendees((prev) => prev.filter((a) => a.mem_id !== memId));
    syncGatheringCount(gthrId, -1);

    const result = await removeGatheringAttendance(gthrId, memId, reason || undefined);
    if (!result.ok) {
      // 참가자 목록 롤백은 아직 같은 모임을 보고 있을 때만 (전환됐으면 이미 새 목록으로 교체됨)
      if (currentGthrRef.current === gthrId) setAttendees(prevAttendees);
      syncGatheringCount(gthrId, 1); // 리스트 카운트는 gthr_id 기준이라 항상 안전
      toast.error(result.message ?? "참석 취소에 실패했습니다");
    } else {
      toast.success(`${memName}님 참석을 취소했습니다`);
      // 방금 취소가 새 이력(cancel)으로 남았으므로 취소 목록을 새로 불러온다.
      if (currentGthrRef.current === gthrId) loadCancelHistory(gthrId);
    }
    setRemovingMemId(null);
  };

  const handleAddAttendee = async (member: ActiveMember) => {
    if (!selected || adding) return;
    const gthrId = selected.gthr_id;

    setAdding(true);
    const prevAttendees = attendees;
    setAttendees((prev) => [...prev, member]);
    syncGatheringCount(gthrId, 1);

    const result = await addGatheringAttendance(gthrId, member.mem_id);
    if (!result.ok) {
      if (currentGthrRef.current === gthrId) setAttendees(prevAttendees);
      syncGatheringCount(gthrId, -1);
      toast.error(result.message ?? "참석 추가에 실패했습니다");
    } else {
      toast.success(`${member.mem_nm ?? "이름 없음"}님을 참석 처리했습니다`);
      // 재참석이면 취소 목록에서 빠져야 하므로 다시 불러온다.
      if (currentGthrRef.current === gthrId) loadCancelHistory(gthrId);
    }
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <H2>모임 관리</H2>

      {/* 월 이동 */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setMonth((m) => prevMonthStr(m))}
          className="text-muted-foreground active:bg-secondary"
          aria-label="이전 달"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <Body className="min-w-[8rem] text-center text-lg font-bold">
          {monthLabel}
        </Body>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setMonth((m) => nextMonthStr(m))}
          className="text-muted-foreground active:bg-secondary"
          aria-label="다음 달"
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      {/* 모임 목록 */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : gatherings.length === 0 ? (
        <EmptyState
          variant="card"
          icon={CalendarDays}
          message="이번 달 등록된 모임이 없습니다."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {gatherings.map((g) => {
            const stt = dayjs(g.stt_at).tz("Asia/Seoul");
            const typeLabel = gthrTypeLabels[g.gthr_type_enm as GthrType] ?? g.gthr_type_enm;
            const typeBadgeClass = TYPE_BADGE_CLASS[g.gthr_type_enm] ?? TYPE_BADGE_CLASS.general;
            return (
              <CardItem asChild key={g.gthr_id} className="flex flex-col gap-2">
                <button
                  onClick={() => openGathering(g)}
                  className="text-left transition-colors active:bg-secondary"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={typeBadgeClass}>
                      {typeLabel}
                    </Badge>
                    <Caption>{stt.format("M.D(ddd) HH:mm")}</Caption>
                  </div>
                  <Body className="font-semibold">
                    {g.gthr_nm}
                  </Body>
                  <Micro className="flex items-center gap-1">
                    <Users className="size-3" />
                    <span>참석 {g.attd_count}명</span>
                  </Micro>
                </button>
              </CardItem>
            );
          })}
        </div>
      )}

      {/* 참가자 관리 다이얼로그 */}
      <ResponsiveDrawer open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <ResponsiveDrawerContent
          dialogClassName="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden"
          drawerClassName="h-[85dvh] max-h-[85dvh]"
        >
          <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
            <ResponsiveDrawerTitle>{selected?.gthr_nm ?? "참가자 관리"}</ResponsiveDrawerTitle>
            <ResponsiveDrawerDescription className="sr-only">
              모임 참가자 관리
            </ResponsiveDrawerDescription>
          </ResponsiveDrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
            <div className="flex flex-col gap-4">
              {/* 참가자 추가 — 검색해서 선택하면 바로 참석 처리 (별도 추가 버튼 없음) */}
              <Popover open={addOpen} onOpenChange={setAddOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={addOpen}
                    disabled={adding}
                    className="h-10 w-full justify-between rounded-xl font-normal text-muted-foreground"
                  >
                    <span className="flex items-center gap-1.5">
                      <Plus className="size-3.5" />
                      {adding ? "추가 중…" : "참가자 추가 — 이름 검색"}
                    </span>
                    <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="이름 검색…" />
                    <CommandList>
                      <CommandEmpty>
                        {availableMembers.length === 0
                          ? "추가할 수 있는 멤버가 없습니다"
                          : "검색 결과가 없습니다"}
                      </CommandEmpty>
                      <CommandGroup>
                        {availableMembers.map((m) => (
                          <CommandItem
                            key={m.mem_id}
                            value={`${m.mem_nm ?? "이름 없음"} ${m.mem_id}`}
                            onSelect={() => {
                              setAddOpen(false);
                              handleAddAttendee(m);
                            }}
                          >
                            <Plus className="mr-2 size-3.5 text-muted-foreground" />
                            {m.mem_nm ?? "이름 없음"}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* 참가자 목록 */}
              <div className="flex flex-col gap-2">
                <Caption className="text-muted-foreground">
                  참석자 ({attendees.length}명)
                </Caption>
                {attendeesLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-xl" />
                  ))
                ) : attendees.length === 0 ? (
                  <EmptyState message="참석자가 없습니다." />
                ) : (
                  attendees.map((a) => (
                    <div
                      key={a.mem_id}
                      className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar src={a.avatar_url} seed={a.mem_id} alt={a.mem_nm ?? ""} size="sm" />
                        <Body className="font-medium">
                          {a.mem_nm ?? "이름 없음"}
                        </Body>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveAttendee(a.mem_id)}
                        disabled={removingMemId === a.mem_id}
                        aria-label={`${a.mem_nm ?? "이름 없음"} 참석 취소`}
                        className="text-muted-foreground active:text-destructive"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {/* 취소 이력 간단 노출(SG-03 §4, 선택 범위) — 사유 포함 팀 멤버 전체 공개 정책과 동일 */}
              {!canceledLoading && canceledAttendees.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Caption className="text-muted-foreground">
                    취소 ({canceledAttendees.length}명)
                  </Caption>
                  {canceledAttendees.map((c) => (
                    <div
                      key={c.mem_id}
                      className="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5"
                    >
                      <Avatar
                        src={c.avatar_url}
                        seed={c.mem_id}
                        alt={c.mem_nm ?? ""}
                        size="sm"
                        className="opacity-40 grayscale"
                      />
                      <div className="flex flex-col gap-0.5">
                        <Body className="text-muted-foreground">
                          {c.mem_nm ?? "이름 없음"} · {dayjs(c.evt_at).tz("Asia/Seoul").format("M/D HH:mm")} 취소
                        </Body>
                        {c.reason_txt && <Micro>사유: {c.reason_txt}</Micro>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ResponsiveDrawerContent>
      </ResponsiveDrawer>
    </div>
  );
}
