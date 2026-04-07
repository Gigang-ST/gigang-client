"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Calendar, ExternalLink, MapPin, Pencil, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { revalidateCompetitions } from "@/app/actions/revalidate-competitions";
import { updateCompetition } from "@/app/actions/admin/manage-competition";
import {
  competitionEditSchema,
  type CompetitionEditValues,
} from "@/lib/validations/competition";
import { formatDateRange } from "@/lib/dayjs";
import { resolveSportConfig, SPORT_LEGEND } from "./sport-config";
import type { Competition, CompetitionRegistration, MemberStatus } from "./types";

/** 기타(직접 입력) 선택 시 사용하는 셀렉트 값 */
const EVENT_TYPE_OTHER = "__OTHER__";

const roleLabels = {
  participant: "참가",
  cheering: "응원",
  volunteer: "봉사",
} as const;

type RegistrationWithMember = {
  role: string;
  event_type: string | null;
  created_at: string;
  member: { mem_nm: string | null };
};

const SPORT_OPTIONS = SPORT_LEGEND.filter(s => s.key !== "other");

interface CompetitionDetailDialogProps {
  teamId: string;
  competition: Competition | null;
  registration?: CompetitionRegistration;
  memberStatus: MemberStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (
    competitionId: string,
    payload: { role: "participant" | "cheering" | "volunteer"; eventType: string },
  ) => Promise<{ ok: boolean; message: string }>;
  onUpdate: (
    registrationId: string,
    competitionId: string,
    payload: { role: "participant" | "cheering" | "volunteer"; eventType: string },
  ) => Promise<{ ok: boolean; message: string }>;
  onDelete: (
    registrationId: string,
    competitionId: string,
  ) => Promise<{ ok: boolean; message: string }>;
  onCompetitionUpdated?: () => void;
}

export function CompetitionDetailDialog({
  teamId,
  competition,
  registration,
  memberStatus,
  open,
  onOpenChange,
  onCreate,
  onUpdate,
  onDelete,
  onCompetitionUpdated,
}: CompetitionDetailDialogProps) {
  const [role, setRole] = useState<"participant" | "cheering" | "volunteer">(
    "participant",
  );
  const [eventType, setEventType] = useState("");
  const [otherEventType, setOtherEventType] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [participants, setParticipants] = useState<RegistrationWithMember[]>([]);

  // 관리자 수정 모드
  const isAdmin = memberStatus.status === "ready" && memberStatus.admin;
  const [editing, setEditing] = useState(false);

  const editForm = useForm<CompetitionEditValues>({
    defaultValues: { title: "", sport: "", startDate: "", endDate: "", location: "", sourceUrl: "", eventTypes: [] },
    resolver: zodResolver(competitionEditSchema),
  });

  const supabase = useMemo(() => createClient(), []);

  // 참가자 목록 로드
  const loadParticipants = useCallback(async (competitionId: string) => {
    const { data: plan } = await supabase
      .from("team_comp_plan_rel")
      .select("team_comp_id")
      .eq("comp_id", competitionId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (!plan) {
      setParticipants([]);
      return;
    }
    const { data } = await supabase
      .from("comp_reg_rel")
      .select("prt_role_cd, crt_at, comp_evt_cfg(comp_evt_type), mem_mst!comp_reg_rel_mem_id_fkey(mem_nm)")
      .eq("team_comp_id", plan.team_comp_id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("crt_at", { ascending: true });
    const mapped = (data ?? []).map((r) => {
      const row = r as unknown as {
        prt_role_cd: string;
        crt_at: string;
        comp_evt_cfg?: { comp_evt_type: string | null }[] | { comp_evt_type: string | null };
        mem_mst?: { mem_nm: string | null }[] | { mem_nm: string | null };
      };
      const evt = Array.isArray(row.comp_evt_cfg) ? row.comp_evt_cfg[0] : row.comp_evt_cfg;
      const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
      return {
        role: row.prt_role_cd,
        event_type: evt?.comp_evt_type?.toUpperCase() ?? null,
        created_at: row.crt_at,
        member: { mem_nm: mem?.mem_nm ?? null },
      };
    });
    setParticipants(mapped);
  }, [supabase, teamId]);

  useEffect(() => {
    if (!competition || !open) return;
    loadParticipants(competition.id);
  }, [competition?.id, open, loadParticipants]);

  // 대회에 등록된 종목이 있으면 그대로, 없으면 스포츠별 기본 종목(10K, HALF, FULL 등) + 맨 아래 기타
  const eventTypeOptions = useMemo(() => {
    const explicit = competition?.event_types ?? [];
    const list =
      explicit.length > 0
        ? explicit.map((t) => t.toUpperCase())
        : resolveSportConfig(competition?.sport ?? null).eventTypes;
    return list;
  }, [competition?.event_types, competition?.sport]);

  useEffect(() => {
    if (!competition || !open) return;

    const initialRole = registration?.role ?? "participant";
    const regType = (registration?.event_type ?? "").trim().toUpperCase();
    const isInOptions =
      regType && eventTypeOptions.some((o) => o.toUpperCase() === regType);
    const initialOther = !isInOptions && regType ? regType : "";
    const defaultSelect =
      eventTypeOptions.length > 0 ? eventTypeOptions[0] : EVENT_TYPE_OTHER;

    setRole(initialRole);
    setOtherEventType(initialOther);
    if (isInOptions) {
      setEventType(regType);
    } else if (regType) {
      setEventType(EVENT_TYPE_OTHER);
    } else {
      setEventType(defaultSelect);
    }
    setStatusMessage(null);
  }, [competition?.id, open, registration?.id, registration?.role, registration?.event_type, eventTypeOptions]);


  function startEditing() {
    if (!competition) return;
    editForm.reset({
      title: competition.title,
      sport: competition.sport ?? "",
      startDate: competition.start_date,
      endDate: competition.end_date ?? "",
      location: competition.location ?? "",
      sourceUrl: competition.source_url ?? "",
      eventTypes: competition.event_types?.map(t => t.toUpperCase()) ?? [],
    });
    setEditing(true);
  }

  const editSport = editForm.watch("sport");
  const editEventTypes = editForm.watch("eventTypes");
  const editEventTypeOptions = resolveSportConfig(editSport || null).eventTypes;

  async function handleEditSave(data: CompetitionEditValues) {
    if (!competition) return;
    const result = await updateCompetition(competition.id, {
      title: data.title,
      sport: data.sport,
      startDate: data.startDate,
      endDate: data.endDate || null,
      location: data.location,
      eventTypes: data.eventTypes,
      sourceUrl: data.sourceUrl,
    });
    if (!result.ok) {
      editForm.setError("root", { message: "수정에 실패했습니다." });
      return;
    }
    setEditing(false);
    await revalidateCompetitions();
    onCompetitionUpdated?.();
  }

  if (!competition) {
    return null;
  }

  const formattedDate = formatDateRange(
    competition.start_date,
    competition.end_date,
  );

  const isParticipant = role === "participant";
  const requiresEventType = isParticipant;
  const resolvedEventType =
    eventType === EVENT_TYPE_OTHER ? otherEventType.trim().toUpperCase() : eventType;
  const canSubmit =
    !requiresEventType ||
    (eventType === EVENT_TYPE_OTHER ? otherEventType.trim().length > 0 : eventType.length > 0);

  const showAuthMessage = memberStatus.status !== "ready";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!competition) return;

    if (!canSubmit) {
      setStatusMessage("참가 종목을 선택해 주세요.");
      return;
    }

    setIsSaving(true);
    const payload = { role, eventType: resolvedEventType };

    const result = registration
      ? await onUpdate(registration.id, competition.id, payload)
      : await onCreate(competition.id, payload);

    setIsSaving(false);
    setStatusMessage(result.message);
    if (result.ok) loadParticipants(competition.id);
  }

  async function handleDelete() {
    if (!registration || !competition) return;
    setIsSaving(true);
    const result = await onDelete(registration.id, competition.id);
    setIsSaving(false);
    setStatusMessage(result.message);
    if (result.ok) loadParticipants(competition.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-balance">{competition.title}</DialogTitle>
          <DialogDescription className="sr-only">
            대회 상세 정보 및 참가 신청
          </DialogDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            {competition.sport && <Badge variant="secondary">{resolveSportConfig(competition.sport).label}</Badge>}
            {competition.event_types?.slice(0, 3).map((type) => (
              <Badge key={type} variant="outline">
                {type.toUpperCase()}
              </Badge>
            ))}
            {(competition.event_types?.length ?? 0) > 3 && (
              <Badge variant="outline">+{competition.event_types!.length - 3}</Badge>
            )}
          </div>
        </DialogHeader>

        {editing ? (
          <form onSubmit={editForm.handleSubmit(handleEditSave)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>대회명</Label>
              <Input {...editForm.register("title")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>종목</Label>
              <Select value={editSport} onValueChange={(v) => { editForm.setValue("sport", v); editForm.setValue("eventTypes", []); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPORT_OPTIONS.map(s => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>시작일</Label>
              <Input type="date" max="9999-12-31" {...editForm.register("startDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>종료일</Label>
              <Input type="date" max="9999-12-31" {...editForm.register("endDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>장소</Label>
              <Input {...editForm.register("location")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>참가 코스</Label>
              {editEventTypeOptions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {editEventTypeOptions.map(type => (
                    <Button
                      key={type}
                      type="button"
                      size="xs"
                      onClick={() => {
                        const current = editForm.getValues("eventTypes");
                        editForm.setValue("eventTypes", current.includes(type) ? current.filter(t => t !== type) : [...current, type]);
                      }}
                      variant={editEventTypes.includes(type) ? "default" : "outline"}
                      className={cn(
                        "rounded-full",
                        !editEventTypes.includes(type) && "text-muted-foreground hover:border-primary/50",
                      )}
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">종목을 먼저 선택해 주세요.</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>대회 링크</Label>
              <Input type="url" {...editForm.register("sourceUrl")} />
            </div>
            {editForm.formState.errors.endDate && <p className="text-xs text-destructive">{editForm.formState.errors.endDate.message}</p>}
            {editForm.formState.errors.root && <p className="text-xs text-destructive">{editForm.formState.errors.root.message}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={editForm.formState.isSubmitting} className="flex-1">
                {editForm.formState.isSubmitting ? "저장 중..." : "저장"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={editForm.formState.isSubmitting} className="flex-1">
                취소
              </Button>
            </div>
          </form>
        ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="size-4 shrink-0" />
            <span>{formattedDate}</span>
          </div>
          {competition.location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-4 shrink-0" />
              <span>{competition.location}</span>
            </div>
          )}
          {competition.source_url && /^https?:\/\//.test(competition.source_url) && (
            <a
              href={competition.source_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <ExternalLink className="size-4" />
              대회 페이지 보기
            </a>
          )}
        </div>
        )}

        {isAdmin && !editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={startEditing}
            className="self-start"
          >
            <Pencil className="size-3.5 mr-1.5" />
            대회 정보 수정
          </Button>
        )}

        {/* 참가자 목록 */}
        {participants.length > 0 && (() => {
          // 종목별 난이도 순서 (역순: 힘든 것부터)
          const sportEvents = resolveSportConfig(competition.sport).eventTypes;
          const hardestFirst = [...sportEvents].reverse();

          // 참가자의 표시 키 결정
          const getDisplayKey = (p: RegistrationWithMember) =>
            p.event_type ?? (p.role === "participant" ? "미정" : roleLabels[p.role as keyof typeof roleLabels] ?? p.role);

          // 정렬 우선순위: 힘든 코스 → 미정 → 응원/봉사
          const sortOrder = (key: string) => {
            const idx = hardestFirst.indexOf(key);
            if (idx !== -1) return idx;
            if (key === "미정") return hardestFirst.length;
            if (key === "봉사") return hardestFirst.length + 1;
            if (key === "응원") return hardestFirst.length + 2;
            return hardestFirst.length + 3;
          };

          // 코스별 인원 집계 + 정렬
          const eventCounts = new Map<string, number>();
          participants.forEach(p => {
            const key = getDisplayKey(p);
            eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1);
          });
          const sortedCounts = Array.from(eventCounts.entries())
            .sort((a, b) => sortOrder(a[0]) - sortOrder(b[0]));

          // 참가자를 코스별 그룹 + 선착순 정렬
          const sortedParticipants = [...participants].sort((a, b) => {
            const orderDiff = sortOrder(getDisplayKey(a)) - sortOrder(getDisplayKey(b));
            if (orderDiff !== 0) return orderDiff;
            return a.created_at.localeCompare(b.created_at);
          });

          return (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="size-4" />
                  참가 현황 ({participants.length}명)
                </div>
                {/* 코스별 인원 (힘든 순) */}
                <div className="flex flex-wrap gap-1.5">
                  {sortedCounts.map(([event, count]) => (
                    <span
                      key={event}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      {event} {count}명
                    </span>
                  ))}
                </div>
                {/* 참가자 이름 목록 (코스별 그룹 + 선착순) */}
                <div className="flex flex-col gap-1.5 text-xs">
                  {sortedCounts.map(([event]) => {
                    const group = sortedParticipants.filter(p => getDisplayKey(p) === event);
                    return (
                      <div key={event} className="flex items-baseline gap-2">
                        <span className="shrink-0 font-semibold text-foreground">{event}</span>
                        <span className="text-muted-foreground">
                          {group.map(p => p.member?.mem_nm ?? "이름 없음").join(", ")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          );
        })()}

        <Separator />

        {showAuthMessage ? (
          <div className="flex flex-col gap-3 text-sm">
            {memberStatus.status === "signed-out" && (
              <p>로그인 후 참가 신청을 할 수 있습니다.</p>
            )}
            {memberStatus.status === "needs-onboarding" && (
              <p>참가 신청 전에 회원 정보를 먼저 입력해 주세요.</p>
            )}
            {memberStatus.status === "member-fetch-error" && (
              <p>회원 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.</p>
            )}
            {memberStatus.status === "member-fetch-error" ? (
              <Button
                type="button"
                className="w-full"
                onClick={() => window.location.reload()}
              >
                새로고침
              </Button>
            ) : (
              <Button asChild className="w-full">
                <Link
                  href={
                    memberStatus.status === "signed-out"
                      ? "/auth/login?next=%2Fraces"
                      : "/onboarding"
                  }
                >
                  {memberStatus.status === "signed-out" ? "로그인" : "회원정보 입력"}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">참여 방식</Label>
              <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="participant">참가</SelectItem>
                  <SelectItem value="cheering">응원</SelectItem>
                  <SelectItem value="volunteer">봉사</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isParticipant && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-type">참가 종목</Label>
                <Select
                  value={eventType}
                  onValueChange={(value) => setEventType(value)}
                >
                  <SelectTrigger id="event-type">
                    <SelectValue placeholder="종목 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypeOptions.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                    <SelectItem value={EVENT_TYPE_OTHER}>
                      기타 (직접 입력)
                    </SelectItem>
                  </SelectContent>
                </Select>
                {eventType === EVENT_TYPE_OTHER && (
                  <Input
                    placeholder="예: 10K, HALF"
                    value={otherEventType}
                    onChange={(e) => setOtherEventType(e.target.value)}
                    className="mt-1"
                  />
                )}
              </div>
            )}

            {registration && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                현재 상태: {roleLabels[registration.role]}
                {registration.event_type && ` · ${registration.event_type}`}
              </div>
            )}

            {statusMessage && (
              <p className="text-xs text-muted-foreground">{statusMessage}</p>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="submit" disabled={!canSubmit || isSaving}>
                {registration ? "정보 수정" : "참가 신청"}
              </Button>
              {registration && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={isSaving}
                >
                  신청 취소
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
