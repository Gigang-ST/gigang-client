"use client";

import { useState, useMemo } from "react";
import { Calendar, MapPin } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CompetitionDetailDialog } from "@/components/races/competition-detail-dialog";
import { revalidateCompetitions } from "@/app/actions/revalidate-competitions";
import type { Competition, CompetitionRegistration, MemberStatus } from "@/components/races/types";

type UpcomingRace = {
  id: string;
  title: string;
  start_date: string;
  location: string | null;
  sport: string | null;
  event_types: string[] | null;
  /** 참가자들이 참가 시 입력한 이벤트 타입 (표시용) */
  registered_event_types?: string[];
  label?: string;
};

function formatDDay(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "D-DAY";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

type UpcomingRacesProps = {
  races: UpcomingRace[];
  initialMemberStatus: MemberStatus;
  initialRegistrationsByCompetitionId: Record<string, CompetitionRegistration>;
};

export function UpcomingRaces({
  races,
  initialMemberStatus,
  initialRegistrationsByCompetitionId,
}: UpcomingRacesProps) {
  const supabase = useMemo(() => createClient(), []);
  const memberStatus = initialMemberStatus;
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [registrationsByCompetitionId, setRegistrationsByCompetitionId] =
    useState<Record<string, CompetitionRegistration>>(initialRegistrationsByCompetitionId);

  const createRegistration = async (competitionId: string, payload: { role: "participant" | "cheering" | "volunteer"; eventType: string }) => {
    if (memberStatus.status !== "ready") return { ok: false as const, message: "로그인이 필요합니다." };
    const eventType = payload.role === "participant" ? payload.eventType.trim().toUpperCase() : null;
    const { data, error } = await supabase.from("competition_registration")
      .insert({ competition_id: competitionId, member_id: memberStatus.memberId, role: payload.role, event_type: eventType })
      .select("id, competition_id, member_id, role, event_type, created_at").single();
    if (error) return { ok: false as const, message: "신청에 실패했습니다." };
    setRegistrationsByCompetitionId(prev => ({ ...prev, [competitionId]: data as CompetitionRegistration }));
    return { ok: true as const, message: "참가 신청 완료" };
  };

  const updateRegistration = async (registrationId: string, competitionId: string, payload: { role: "participant" | "cheering" | "volunteer"; eventType: string }) => {
    if (memberStatus.status !== "ready") return { ok: false as const, message: "로그인이 필요합니다." };
    const eventType = payload.role === "participant" ? payload.eventType.trim().toUpperCase() : null;
    const { data, error } = await supabase.from("competition_registration")
      .update({ role: payload.role, event_type: eventType }).eq("id", registrationId)
      .select("id, competition_id, member_id, role, event_type, created_at").single();
    if (error) return { ok: false as const, message: "수정에 실패했습니다." };
    setRegistrationsByCompetitionId(prev => ({ ...prev, [competitionId]: data as CompetitionRegistration }));
    return { ok: true as const, message: "업데이트 완료" };
  };

  const deleteRegistration = async (registrationId: string, competitionId: string) => {
    const { error } = await supabase.from("competition_registration").delete().eq("id", registrationId);
    if (error) return { ok: false as const, message: "취소에 실패했습니다." };
    setRegistrationsByCompetitionId(prev => { const next = { ...prev }; delete next[competitionId]; return next; });
    return { ok: true as const, message: "취소 완료" };
  };

  function handleCardClick(race: UpcomingRace) {
    // UpcomingRace → Competition 변환 (필수 필드 채우기)
    const displayEventTypes = race.registered_event_types?.length
      ? race.registered_event_types
      : race.event_types;
    const comp: Competition = {
      id: race.id,
      external_id: "",
      sport: race.sport,
      title: race.title,
      start_date: race.start_date,
      end_date: null,
      location: race.location,
      event_types: displayEventTypes ?? null,
      source_url: null,
    };
    setSelectedCompetition(comp);
    setDetailOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground">
          UPCOMING RACES
        </span>
        <Link href="/races" className="text-xs font-medium text-primary">
          모두 보기
        </Link>
      </div>
      {races.length === 0 ? (
        <p className="rounded-2xl border-[1.5px] border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          예정된 대회가 없습니다
        </p>
      ) : (
        races.map((race) => {
          const eventTypes = race.registered_event_types ?? race.event_types;
          return (
            <button
              key={race.id}
              onClick={() => handleCardClick(race)}
              className="flex w-full flex-col gap-3 rounded-2xl border-[1.5px] border-border p-4 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  {race.label && (
                    <span className="text-[11px] font-semibold text-primary">
                      {race.label}
                    </span>
                  )}
                  <span className="text-[15px] font-semibold text-foreground">
                    {race.title}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive">
                  {formatDDay(race.start_date)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {race.start_date}
                </span>
                {race.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {race.location}
                  </span>
                )}
              </div>
              {eventTypes && eventTypes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {eventTypes.map((et: string) => (
                    <span
                      key={et}
                      className="rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-bold text-background"
                    >
                      {et}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })
      )}

      <CompetitionDetailDialog
        competition={selectedCompetition}
        registration={selectedCompetition ? registrationsByCompetitionId[selectedCompetition.id] : undefined}
        memberStatus={memberStatus}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCreate={createRegistration}
        onUpdate={updateRegistration}
        onDelete={deleteRegistration}
        onCompetitionUpdated={async () => { await revalidateCompetitions(); window.location.reload(); }}
      />
    </div>
  );
}
