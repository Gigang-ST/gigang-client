"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CalendarHeader } from "./calendar-header";
import { CalendarGrid } from "./calendar-grid";
import { CompetitionDetailDialog } from "./competition-detail-dialog";
import {
  getGridDateRange,
  parseDate,
  toDateStr,
} from "./date-utils";
import type {
  Competition,
  CompetitionRegistration,
  MemberStatus,
} from "./types";

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

      const { data, error } = await supabase
        .from("competition")
        .select(COMPETITION_FIELDS)
        .lte("start_date", endStr)
        .or(`end_date.is.null,end_date.gte.${startStr}`)
        .order("start_date", { ascending: true });

      if (!active) return;

      if (error) {
        setCompetitionsError("대회 정보를 불러오지 못했어. 잠시 후 다시 시도해줘.");
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
        setRegistrationsError("참가 신청 정보를 불러오지 못했어.");
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
        return { ok: false, message: "로그인이 필요해." };
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
        return { ok: false, message: "신청에 실패했어. 다시 시도해줘." };
      }

      setRegistrationsByCompetitionId((prev) => ({
        ...prev,
        [competitionId]: data as CompetitionRegistration,
      }));

      return { ok: true, message: "참가 신청이 완료됐어." };
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
        return { ok: false, message: "로그인이 필요해." };
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
        return { ok: false, message: "수정에 실패했어. 다시 시도해줘." };
      }

      setRegistrationsByCompetitionId((prev) => ({
        ...prev,
        [competitionId]: data as CompetitionRegistration,
      }));

      return { ok: true, message: "신청 정보가 업데이트됐어." };
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
        return { ok: false, message: "취소에 실패했어. 다시 시도해줘." };
      }

      setRegistrationsByCompetitionId((prev) => {
        const next = { ...prev };
        delete next[competitionId];
        return next;
      });

      return { ok: true, message: "참가 신청을 취소했어." };
    },
    [supabase],
  );

  return (
    <div className="flex h-[70vh] flex-col">
      <CalendarHeader
        currentDate={currentDate}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
      />

      {(competitionsLoading || competitionsError || registrationsError) && (
        <div className="px-4 pb-2 text-xs text-muted-foreground">
          {competitionsLoading && "대회 일정을 불러오는 중..."}
          {!competitionsLoading && competitionsError}
          {!competitionsLoading && !competitionsError && registrationsError}
        </div>
      )}

      <CalendarGrid
        currentDate={currentDate}
        competitionsByDate={competitionsByDate}
        registrationsByCompetitionId={registrationsByCompetitionId}
        onSelectCompetition={handleSelectCompetition}
      />

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
