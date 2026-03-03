"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CalendarHeader } from "./calendar-header";
import { CalendarGrid } from "./calendar-grid";
import { CompetitionDetailDialog } from "./competition-detail-dialog";
import {
  getGridDateRange,
  formatDate,
  parseDate,
  toDateStr,
} from "./date-utils";
import type {
  Competition,
  CompetitionRegistration,
  MemberStatus,
} from "./types";
import { resolveSportConfig } from "./sport-config";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const COMPETITION_FIELDS =
  "id, external_id, sport, title, start_date, end_date, location, event_types, source_url";

type RegistrationPayload = {
  role: "participant" | "cheering" | "volunteer";
  eventType: string;
};

type MutationResult = { ok: true; message: string } | { ok: false; message: string };

export function CompetitionCalendar() {
  const supabase = useMemo(() => createClient(), []);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionsError, setCompetitionsError] = useState<string | null>(null);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);
  const [memberStatus, setMemberStatus] = useState<MemberStatus>({ status: "loading" });
  const [registrationsByCompetitionId, setRegistrationsByCompetitionId] =
    useState<Record<string, CompetitionRegistration>>({});
  const [registrationsError, setRegistrationsError] = useState<string | null>(null);
  const [selectedCompetition, setSelectedCompetition] =
    useState<Competition | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState(() => {
    const today = new Date();
    return toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  });

  const gridRange = useMemo(() => getGridDateRange(currentDate), [currentDate]);

  const competitionsByDate = useMemo(() => {
    const map = new Map<string, Competition[]>();
    const gridStart = gridRange.start;
    const gridEnd = gridRange.end;

    competitions.forEach((competition) => {
      const startDate = parseDate(competition.start_date);
      const endDate = parseDate(competition.end_date ?? competition.start_date);
      const clampedStart = startDate < gridStart ? new Date(gridStart) : startDate;
      const clampedEnd = endDate > gridEnd ? new Date(gridEnd) : endDate;

      if (clampedStart > clampedEnd) {
        return;
      }

      const cursor = new Date(clampedStart);
      while (cursor <= clampedEnd) {
        const dateStr = toDateStr(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate(),
        );
        const list = map.get(dateStr) ?? [];
        list.push(competition);
        map.set(dateStr, list);
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    const isMarathon = (title: string) => /마라톤|marathon/i.test(title);
    map.forEach((list) => {
      list.sort((a, b) => {
        const aScore = isMarathon(a.title) ? 0 : 1;
        const bScore = isMarathon(b.title) ? 0 : 1;
        return aScore - bScore;
      });
    });

    return map;
  }, [competitions, gridRange.end, gridRange.start]);

  const handlePrevMonth = useCallback(() => {
    setCurrentDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1));
  }, []);

  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleSelectCompetition = useCallback((competition: Competition) => {
    setSelectedCompetition(competition);
    setDetailOpen(true);
  }, []);

  useEffect(() => {
    if (
      selectedDateStr < gridRange.startStr ||
      selectedDateStr > gridRange.endStr
    ) {
      setSelectedDateStr(gridRange.startStr);
    }
    setExpandedDate(null);
  }, [gridRange.endStr, gridRange.startStr, selectedDateStr]);

  useEffect(() => {
    let active = true;

    async function loadMember() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !user) {
        setMemberStatus({ status: "signed-out" });
        return;
      }

      const { data: member } = await supabase
        .from("member")
        .select("id, full_name, email")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!active) return;

      if (!member) {
        setMemberStatus({ status: "needs-onboarding", userId: user.id });
        return;
      }

      setMemberStatus({
        status: "ready",
        userId: user.id,
        memberId: member.id,
        fullName: member.full_name ?? null,
        email: member.email ?? null,
      });
    }

    loadMember();

    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    let active = true;

    async function loadCompetitions() {
      setCompetitionsLoading(true);
      setCompetitionsError(null);

      const { startStr, endStr } = gridRange;

      const [{ data, error }] = await Promise.all([
        supabase
          .from("competition")
          .select(COMPETITION_FIELDS)
          .lte("start_date", endStr)
          .or(`end_date.is.null,end_date.gte.${startStr}`)
          .order("start_date", { ascending: true }),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);

      if (!active) return;

      if (error) {
        setCompetitionsError("대회 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setCompetitions([]);
      } else {
        setCompetitions((data ?? []) as Competition[]);
      }

      setCompetitionsLoading(false);
    }

    loadCompetitions();

    return () => {
      active = false;
    };
  }, [gridRange, supabase]);

  useEffect(() => {
    let active = true;

    async function loadRegistrations() {
      if (memberStatus.status !== "ready") {
        setRegistrationsByCompetitionId({});
        setRegistrationsError(null);
        return;
      }

      if (competitions.length === 0) {
        setRegistrationsByCompetitionId({});
        setRegistrationsError(null);
        return;
      }

      const competitionIds = competitions.map((competition) => competition.id);
      const { data, error } = await supabase
        .from("competition_registration")
        .select("id, competition_id, member_id, role, event_type, created_at")
        .eq("member_id", memberStatus.memberId)
        .in("competition_id", competitionIds);

      if (!active) return;

      if (error) {
        setRegistrationsError("참가 신청 정보를 불러오지 못했습니다.");
        setRegistrationsByCompetitionId({});
        return;
      }

      const map: Record<string, CompetitionRegistration> = {};
      (data ?? []).forEach((registration) => {
        map[registration.competition_id] = registration as CompetitionRegistration;
      });
      setRegistrationsByCompetitionId(map);
      setRegistrationsError(null);
    }

    loadRegistrations();

    return () => {
      active = false;
    };
  }, [competitions, memberStatus, supabase]);

  const createRegistration = useCallback(
    async (
      competitionId: string,
      payload: RegistrationPayload,
    ): Promise<MutationResult> => {
      if (memberStatus.status !== "ready") {
        return { ok: false, message: "로그인이 필요합니다." };
      }

      const eventType =
        payload.role === "participant"
          ? payload.eventType.trim().toUpperCase()
          : null;

      const { data, error } = await supabase
        .from("competition_registration")
        .insert({
          competition_id: competitionId,
          member_id: memberStatus.memberId,
          role: payload.role,
          event_type: eventType,
        })
        .select("id, competition_id, member_id, role, event_type, created_at")
        .single();

      if (error) {
        return { ok: false, message: "신청에 실패했습니다. 다시 시도해 주세요." };
      }

      setRegistrationsByCompetitionId((prev) => ({
        ...prev,
        [competitionId]: data as CompetitionRegistration,
      }));

      return { ok: true, message: "참가 신청이 완료되었습니다." };
    },
    [memberStatus, supabase],
  );

  const updateRegistration = useCallback(
    async (
      registrationId: string,
      competitionId: string,
      payload: RegistrationPayload,
    ): Promise<MutationResult> => {
      if (memberStatus.status !== "ready") {
        return { ok: false, message: "로그인이 필요합니다." };
      }

      const eventType =
        payload.role === "participant"
          ? payload.eventType.trim().toUpperCase()
          : null;

      const { data, error } = await supabase
        .from("competition_registration")
        .update({
          role: payload.role,
          event_type: eventType,
        })
        .eq("id", registrationId)
        .select("id, competition_id, member_id, role, event_type, created_at")
        .single();

      if (error) {
        return { ok: false, message: "수정에 실패했습니다. 다시 시도해 주세요." };
      }

      setRegistrationsByCompetitionId((prev) => ({
        ...prev,
        [competitionId]: data as CompetitionRegistration,
      }));

      return { ok: true, message: "신청 정보가 업데이트되었습니다." };
    },
    [memberStatus, supabase],
  );

  const deleteRegistration = useCallback(
    async (
      registrationId: string,
      competitionId: string,
    ): Promise<MutationResult> => {
      const { error } = await supabase
        .from("competition_registration")
        .delete()
        .eq("id", registrationId);

      if (error) {
        return { ok: false, message: "취소에 실패했습니다. 다시 시도해 주세요." };
      }

      setRegistrationsByCompetitionId((prev) => {
        const next = { ...prev };
        delete next[competitionId];
        return next;
      });

      return { ok: true, message: "참가 신청을 취소했습니다." };
    },
    [supabase],
  );

  return (
    <div className="flex flex-col">
      <CalendarHeader
        currentDate={currentDate}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
      />

      {!competitionsLoading && (competitionsError || registrationsError) && (
        <div className="px-4 pb-2 text-xs text-muted-foreground">
          {competitionsError}
          {!competitionsError && registrationsError}
        </div>
      )}

      <CalendarGrid
        currentDate={currentDate}
        competitionsByDate={competitionsByDate}
        registrationsByCompetitionId={registrationsByCompetitionId}
        onSelectCompetition={handleSelectCompetition}
        loading={competitionsLoading}
        selectedDateStr={selectedDateStr}
        onSelectDay={(dateStr) => {
          setSelectedDateStr(dateStr);
          setExpandedDate(null);
        }}
        expandedDate={expandedDate}
        onToggleExpanded={(dateStr) =>
          setExpandedDate((prev) => (prev === dateStr ? null : dateStr))
        }
      />

      <div className="px-4 pb-4 pt-3 md:hidden">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">
            {formatDate(selectedDateStr)}
          </span>
          {!competitionsLoading && (
            <span className="text-xs text-white/50">
              {(competitionsByDate.get(selectedDateStr) ?? []).length}개 일정
            </span>
          )}
        </div>
        <div className="mt-3 flex max-h-[50vh] flex-col gap-2.5 overflow-y-auto">
          {competitionsLoading ? (
            <>
              <MobileCompetitionCardSkeleton />
              <MobileCompetitionCardSkeleton />
            </>
          ) : (competitionsByDate.get(selectedDateStr) ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-center text-xs text-white/50">
              이 날짜에 일정이 없습니다.
            </p>
          ) : (
            (competitionsByDate.get(selectedDateStr) ?? []).map((competition) => (
              <MobileCompetitionCard
                key={`${competition.id}-mobile`}
                competition={competition}
                isRegistered={Boolean(
                  registrationsByCompetitionId[competition.id],
                )}
                onClick={() => handleSelectCompetition(competition)}
              />
            ))
          )}
        </div>
      </div>

      <CompetitionDetailDialog
        competition={selectedCompetition}
        registration={
          selectedCompetition
            ? registrationsByCompetitionId[selectedCompetition.id]
            : undefined
        }
        memberStatus={memberStatus}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCreate={createRegistration}
        onUpdate={updateRegistration}
        onDelete={deleteRegistration}
      />
    </div>
  );
}

function MobileCompetitionCard({
  competition,
  isRegistered,
  onClick,
}: {
  competition: Competition;
  isRegistered: boolean;
  onClick: () => void;
}) {
  const sportConfig = resolveSportConfig(competition.sport);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg bg-white/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.10]",
        isRegistered && "ring-1 ring-primary/60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 h-8 w-1 shrink-0 rounded-full",
          sportConfig.dotClass,
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-snug text-white">
          {competition.title}
        </span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/60">
          {competition.sport && (
            <span className="inline-flex items-center gap-1">
              <span
                className={cn("size-1.5 rounded-full", sportConfig.dotClass)}
              />
              {sportConfig.label}
            </span>
          )}
          {competition.location && (
            <span className="truncate">{competition.location}</span>
          )}
          {competition.event_types && competition.event_types.length > 0 && (
            <span>{competition.event_types.map((t) => t.toUpperCase()).join(" · ")}</span>
          )}
        </div>
      </div>
      {isRegistered && (
        <span className="mt-1 shrink-0 text-[10px] font-medium text-primary">
          참가
        </span>
      )}
    </button>
  );
}

function MobileCompetitionCardSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-white/[0.06] px-3 py-2.5">
      <Skeleton className="mt-0.5 h-8 w-1 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-3/4 rounded" />
        <Skeleton className="h-2.5 w-1/2 rounded" />
      </div>
    </div>
  );
}
