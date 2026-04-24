"use client";

import { useState, useMemo } from "react";
import { Calendar, MapPin } from "lucide-react";
import Link from "next/link";
import { compEvtTypeContainsHangul } from "@/lib/comp-evt-type";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateCompEvtIdForParticipation } from "@/app/actions/get-or-create-comp-evt-for-participation";
import { revalidateCompetitions } from "@/app/actions/revalidate-competitions";
import { CompetitionDetailDialog } from "@/components/races/competition-detail-dialog";
import { formatDDay } from "@/lib/dayjs";
import { CardItem } from "@/components/ui/card";
import type { Competition, CompetitionRegistration, MemberStatus } from "@/components/races/types";
import { SectionLabel } from "@/components/common/typography";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";
import { ensureTeamCompPlanRel } from "@/lib/queries/ensure-team-comp-plan-rel";

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

type UpcomingRacesProps = {
  teamId: string;
  cmmCdRows: CachedCmmCdRow[];
  races: UpcomingRace[];
  initialMemberStatus: MemberStatus;
  initialRegistrationsByCompetitionId: Record<string, CompetitionRegistration>;
};

export function UpcomingRaces({
  teamId,
  cmmCdRows,
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
    if (payload.role === "participant" && eventType && compEvtTypeContainsHangul(eventType)) {
      return { ok: false as const, message: "종목은 한글을 사용할 수 없습니다. 영문·숫자로 입력해 주세요." };
    }
    const ensured = await ensureTeamCompPlanRel(supabase, teamId, competitionId);
    if (!ensured.ok) return { ok: false as const, message: "신청에 실패했습니다." };
    const plan = { team_comp_id: ensured.teamCompId };

    let compEvtId: string | null = null;
    if (payload.role === "participant") {
      if (!eventType) {
        return { ok: false as const, message: "참가 종목을 선택해 주세요." };
      }
      const resolved = await getOrCreateCompEvtIdForParticipation(
        competitionId,
        eventType,
      );
      if (!resolved.ok) {
        return { ok: false as const, message: resolved.message };
      }
      compEvtId = resolved.compEvtId;
    }

    const { data, error } = await supabase.from("comp_reg_rel")
      .insert({ team_comp_id: plan.team_comp_id, mem_id: memberStatus.memberId, prt_role_cd: payload.role, comp_evt_id: compEvtId, vers: 0, del_yn: false })
      .select("comp_reg_id, mem_id, prt_role_cd, crt_at").single();
    if (error) return { ok: false as const, message: "신청에 실패했습니다." };
    setRegistrationsByCompetitionId(prev => ({ ...prev, [competitionId]: { id: data.comp_reg_id, competition_id: competitionId, member_id: data.mem_id, role: data.prt_role_cd as "participant" | "cheering" | "volunteer", event_type: eventType, created_at: data.crt_at } }));
    return { ok: true as const, message: "참가 신청 완료" };
  };

  const updateRegistration = async (registrationId: string, competitionId: string, payload: { role: "participant" | "cheering" | "volunteer"; eventType: string }) => {
    if (memberStatus.status !== "ready") return { ok: false as const, message: "로그인이 필요합니다." };
    const eventType = payload.role === "participant" ? payload.eventType.trim().toUpperCase() : null;
    if (payload.role === "participant" && eventType && compEvtTypeContainsHangul(eventType)) {
      return { ok: false as const, message: "종목은 한글을 사용할 수 없습니다. 영문·숫자로 입력해 주세요." };
    }

    let compEvtId: string | null = null;
    if (payload.role === "participant") {
      if (!eventType) {
        return { ok: false as const, message: "참가 종목을 선택해 주세요." };
      }
      const resolved = await getOrCreateCompEvtIdForParticipation(
        competitionId,
        eventType,
      );
      if (!resolved.ok) {
        return { ok: false as const, message: resolved.message };
      }
      compEvtId = resolved.compEvtId;
    }

    const { data, error } = await supabase.from("comp_reg_rel")
      .update({ prt_role_cd: payload.role, comp_evt_id: compEvtId }).eq("comp_reg_id", registrationId)
      .select("comp_reg_id, mem_id, prt_role_cd, crt_at").single();
    if (error) return { ok: false as const, message: "수정에 실패했습니다." };
    setRegistrationsByCompetitionId(prev => ({ ...prev, [competitionId]: { id: data.comp_reg_id, competition_id: competitionId, member_id: data.mem_id, role: data.prt_role_cd as "participant" | "cheering" | "volunteer", event_type: eventType, created_at: data.crt_at } }));
    return { ok: true as const, message: "업데이트 완료" };
  };

  const deleteRegistration = async (registrationId: string, competitionId: string) => {
    const { error } = await supabase.from("comp_reg_rel").delete().eq("comp_reg_id", registrationId);
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
        <SectionLabel>UPCOMING RACES</SectionLabel>
        <Link href="/races" className="text-xs font-medium text-primary">
          모두 보기
        </Link>
      </div>
      {races.length === 0 ? (
        <CardItem variant="dashed" className="py-8 text-center text-sm text-muted-foreground">
          예정된 대회가 없습니다
        </CardItem>
      ) : (
        races.map((race) => {
          const eventTypes = race.registered_event_types ?? race.event_types;
          return (
            <CardItem asChild key={race.id}>
              <button
                onClick={() => handleCardClick(race)}
                className="flex w-full flex-col gap-3 text-left transition-colors hover:bg-muted/50"
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
                      className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-secondary-foreground"
                    >
                      {et}
                    </span>
                  ))}
                </div>
              )}
              </button>
            </CardItem>
          );
        })
      )}

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
        onCompetitionUpdated={async () => { await revalidateCompetitions(); window.location.reload(); }}
      />
    </div>
  );
}
