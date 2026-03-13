"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
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
import { formatDateRange } from "./date-utils";
import { resolveSportConfig, SPORT_LEGEND } from "./sport-config";
import type { Competition, CompetitionRegistration, MemberStatus } from "./types";

const roleLabels = {
  participant: "참가",
  cheering: "응원",
  volunteer: "봉사",
} as const;

type RegistrationWithMember = {
  role: string;
  event_type: string | null;
  created_at: string;
  member: { full_name: string | null };
};

const SPORT_OPTIONS = SPORT_LEGEND.filter(s => s.key !== "other");

interface CompetitionDetailDialogProps {
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [participants, setParticipants] = useState<RegistrationWithMember[]>([]);

  // 관리자 수정 모드
  const isAdmin = memberStatus.status === "ready" && memberStatus.admin;
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSport, setEditSport] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [editEventTypes, setEditEventTypes] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  // 참가자 목록 로드
  const loadParticipants = useCallback(async (competitionId: string) => {
    const { data } = await supabase
      .from("competition_registration")
      .select("role, event_type, created_at, member:member_id(full_name)")
      .eq("competition_id", competitionId)
      .order("created_at", { ascending: true });
    setParticipants((data ?? []) as unknown as RegistrationWithMember[]);
  }, [supabase]);

  useEffect(() => {
    if (!competition || !open) return;
    loadParticipants(competition.id);
  }, [competition?.id, open, loadParticipants]);

  const eventTypeOptions = useMemo(() => {
    const explicit = competition?.event_types ?? [];
    return explicit.map((type) => type.toUpperCase());
  }, [competition?.event_types]);

  useEffect(() => {
    if (!competition || !open) return;

    const initialRole = registration?.role ?? "participant";
    const initialEventType =
      registration?.event_type ?? eventTypeOptions[0] ?? "";

    setRole(initialRole);
    setEventType(initialEventType ?? "");
    setStatusMessage(null);
  }, [competition?.id, open, registration?.id, registration?.role, registration?.event_type, eventTypeOptions]);

  function startEditing() {
    if (!competition) return;
    setEditTitle(competition.title);
    setEditSport(competition.sport ?? "");
    setEditStartDate(competition.start_date);
    setEditEndDate(competition.end_date ?? "");
    setEditLocation(competition.location ?? "");
    setEditSourceUrl(competition.source_url ?? "");
    setEditEventTypes(competition.event_types?.map(t => t.toUpperCase()) ?? []);
    setEditError(null);
    setEditing(true);
  }

  const editEventTypeOptions = resolveSportConfig(editSport || null).eventTypes;

  async function handleEditSave() {
    if (!competition) return;
    if (editEndDate && editEndDate < editStartDate) {
      setEditError("종료일은 시작일 이후여야 합니다.");
      return;
    }
    setIsSaving(true);
    setEditError(null);
    const { error } = await supabase.from("competition").update({
      title: editTitle.trim(),
      sport: editSport,
      start_date: editStartDate,
      end_date: editEndDate || null,
      location: editLocation.trim(),
      source_url: editSourceUrl.trim() || null,
      event_types: editEventTypes.length > 0 ? editEventTypes : null,
    }).eq("id", competition.id);
    setIsSaving(false);
    if (error) {
      setEditError("수정에 실패했습니다.");
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
  const canSubmit = !requiresEventType || eventType.trim().length > 0;

  const showAuthMessage = memberStatus.status !== "ready";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!competition) return;

    if (!canSubmit) {
      setStatusMessage("참가 종목을 선택해 주세요.");
      return;
    }

    setIsSaving(true);
    const payload = { role, eventType };

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
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>대회명</Label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>종목</Label>
              <Select value={editSport} onValueChange={(v) => { setEditSport(v); setEditEventTypes([]); }}>
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
              <Input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>종료일</Label>
              <Input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>장소</Label>
              <Input value={editLocation} onChange={e => setEditLocation(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>참가 코스</Label>
              {editEventTypeOptions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {editEventTypeOptions.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setEditEventTypes(prev =>
                        prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                      )}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        editEventTypes.includes(type)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50",
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">종목을 먼저 선택해주세요</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>대회 링크</Label>
              <Input type="url" value={editSourceUrl} onChange={e => setEditSourceUrl(e.target.value)} />
            </div>
            {editError && <p className="text-xs text-destructive">{editError}</p>}
            <div className="flex gap-2">
              <Button onClick={handleEditSave} disabled={isSaving || !editTitle.trim() || !editSport || !editStartDate} className="flex-1">
                {isSaving ? "저장 중..." : "저장"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={isSaving} className="flex-1">
                취소
              </Button>
            </div>
          </div>
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
                          {group.map(p => p.member?.full_name ?? "이름 없음").join(", ")}
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
                {eventTypeOptions.length > 0 ? (
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
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="event-type"
                    placeholder="예: 10K"
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value)}
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
