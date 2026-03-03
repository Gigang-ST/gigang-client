"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, ExternalLink, MapPin } from "lucide-react";
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
import { formatDateRange } from "./date-utils";
import type { Competition, CompetitionRegistration, MemberStatus } from "./types";

const roleLabels = {
  participant: "참가",
  cheering: "응원",
  volunteer: "봉사",
} as const;

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
}: CompetitionDetailDialogProps) {
  const [role, setRole] = useState<"participant" | "cheering" | "volunteer">(
    "participant",
  );
  const [eventType, setEventType] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const eventTypeOptions = useMemo(() => {
    const types = competition?.event_types ?? [];
    return types.map((type) => type.toUpperCase());
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
  }

  async function handleDelete() {
    if (!registration || !competition) return;
    setIsSaving(true);
    const result = await onDelete(registration.id, competition.id);
    setIsSaving(false);
    setStatusMessage(result.message);
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
            {competition.sport && <Badge variant="secondary">{competition.sport}</Badge>}
            {competition.event_types?.slice(0, 3).map((type) => (
              <Badge key={type} variant="outline">
                {type.toUpperCase()}
              </Badge>
            ))}
          </div>
        </DialogHeader>

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
          {competition.source_url && (
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
