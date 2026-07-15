"use client";

import { useState, useMemo, useEffect, useRef } from "react";

import { compEvtTypeContainsHangul } from "@/lib/comp-evt-type";
import { dayjs, formatDDay } from "@/lib/dayjs";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";
import { ensureTeamCompPlanRel } from "@/lib/queries/ensure-team-comp-plan-rel";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { getMentionMembers } from "@/app/actions/comment/get-mention-members";
import { getOrCreateCompEvtIdForParticipation } from "@/app/actions/get-or-create-comp-evt-for-participation";
import { revalidateCompetitions } from "@/app/actions/revalidate-competitions";

import type { MemberOption } from "@/components/comment/mention-input";
import { EmptyState } from "@/components/common/empty-state";
import { SectionHeader } from "@/components/common/section-header";
import { Micro, Caption } from "@/components/common/typography";
import dynamic from "next/dynamic";
import type { CompetitionDetailDialogProps } from "@/components/races/competition-detail-dialog";
import type { Competition, CompetitionRegistration, MemberStatus } from "@/components/races/types";

const CompetitionDetailDialog = dynamic<CompetitionDetailDialogProps>(
  () => import("@/components/races/competition-detail-dialog").then((m) => m.CompetitionDetailDialog),
  { ssr: false }
);


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

  const [membersCache, setMembersCache] = useState<MemberOption[] | null>(null);
  const membersFetchingRef = useRef(false);
  useEffect(() => {
    if (memberStatus.status !== "ready") return;
    if (membersCache !== null || membersFetchingRef.current) return;
    if (!detailOpen) return;
    membersFetchingRef.current = true;
    getMentionMembers()
      .then(setMembersCache)
      .catch(() => { membersFetchingRef.current = false; });
  }, [detailOpen, membersCache, memberStatus.status]);

  const createRegistration = async (
    competitionId: string,
    payload: { role: "participant" | "cheering" | "volunteer"; eventType: string },
  ) => {
    if (memberStatus.status === "inactive") return { ok: false as const, message: "지금은 활동할 수 없어요. 관리자 승인이 필요해요." };
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
      const resolved = await getOrCreateCompEvtIdForParticipation(competitionId, eventType);
      if (!resolved.ok) {
        return { ok: false as const, message: resolved.message };
      }
      compEvtId = resolved.compEvtId;
    }

    const { data, error } = await supabase
      .from("comp_reg_rel")
      .insert({
        team_comp_id: plan.team_comp_id,
        mem_id: memberStatus.memberId,
        prt_role_cd: payload.role,
        comp_evt_id: compEvtId,
        vers: 0,
        del_yn: false,
      })
      .select("comp_reg_id, mem_id, prt_role_cd, crt_at")
      .single();
    if (error) return { ok: false as const, message: "신청에 실패했습니다." };
    setRegistrationsByCompetitionId((prev) => ({
      ...prev,
      [competitionId]: {
        id: data.comp_reg_id,
        competition_id: competitionId,
        member_id: data.mem_id,
        role: data.prt_role_cd as "participant" | "cheering" | "volunteer",
        event_type: eventType,
        created_at: data.crt_at,
      },
    }));
    return { ok: true as const, message: "참가 신청 완료" };
  };

  const updateRegistration = async (
    registrationId: string,
    competitionId: string,
    payload: { role: "participant" | "cheering" | "volunteer"; eventType: string },
  ) => {
    if (memberStatus.status === "inactive") return { ok: false as const, message: "지금은 활동할 수 없어요. 관리자 승인이 필요해요." };
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
      const resolved = await getOrCreateCompEvtIdForParticipation(competitionId, eventType);
      if (!resolved.ok) {
        return { ok: false as const, message: resolved.message };
      }
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
      [competitionId]: {
        id: data.comp_reg_id,
        competition_id: competitionId,
        member_id: data.mem_id,
        role: data.prt_role_cd as "participant" | "cheering" | "volunteer",
        event_type: eventType,
        created_at: data.crt_at,
      },
    }));
    return { ok: true as const, message: "업데이트 완료" };
  };

  const deleteRegistration = async (registrationId: string, competitionId: string) => {
    if (memberStatus.status === "inactive") return { ok: false as const, message: "지금은 활동할 수 없어요. 관리자 승인이 필요해요." };
    const { error } = await supabase
      .from("comp_reg_rel")
      .delete()
      .eq("comp_reg_id", registrationId);
    if (error) return { ok: false as const, message: "취소에 실패했습니다." };
    setRegistrationsByCompetitionId((prev) => {
      const next = { ...prev };
      delete next[competitionId];
      return next;
    });
    return { ok: true as const, message: "취소 완료" };
  };

  function handleRowClick(race: UpcomingRace) {
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
    <div className="flex flex-col gap-3">
      <SectionHeader
        label="UPCOMING RACES"
        action={{ label: "모두 보기", href: "/races" }}
      />

      {races.length === 0 ? (
        <EmptyState variant="inline" message="예정된 대회가 없습니다" />
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {races.map((race) => {
            const dday = formatDDay(race.start_date);
            // D-day 뱃지 색상: D-DAY 또는 D+는 destructive, D-7 이하는 warning, 나머지 muted
            const ddayNum = dday.startsWith("D-") && dday !== "D-DAY"
              ? parseInt(dday.slice(2), 10)
              : null;
            const ddayCls = dday === "D-DAY" || dday.startsWith("D+")
              ? "bg-destructive/10 text-destructive"
              : ddayNum !== null && ddayNum <= 7
                ? "bg-warning/15 text-warning"
                : "bg-secondary text-muted-foreground";

            return (
              <button
                key={race.id}
                onClick={() => handleRowClick(race)}
                className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:bg-muted/40 first:pt-0.5 last:pb-0.5"
              >
                {/* D-day 뱃지 — 너비 고정 */}
                <span
                  className={cn(
                    "w-14 shrink-0 rounded-md px-2 py-0.5 text-center font-mono text-[11px] font-bold",
                    ddayCls,
                  )}
                >
                  {dday}
                </span>

                {/* 라벨 — 너비 고정 */}
                <span className="w-14 shrink-0 flex items-center justify-center">
                  {race.label && (
                    <span className="rounded px-1 py-px text-[10px] font-medium bg-secondary text-muted-foreground">
                      {race.label}
                    </span>
                  )}
                </span>

                {/* 대회명 */}
                <Caption className="flex-1 truncate text-foreground font-medium">
                  {race.title}
                </Caption>

                {/* 날짜 */}
                <Micro className="shrink-0 tabular-nums">
                  {dayjs(race.start_date).tz("Asia/Seoul").format("MM/DD")}
                </Micro>
              </button>
            );
          })}
        </div>
      )}

      <CompetitionDetailDialog
        cmmCdRows={cmmCdRows}
        teamId={teamId}
        competition={selectedCompetition}
        registration={
          selectedCompetition
            ? registrationsByCompetitionId[selectedCompetition.id]
            : undefined
        }
        memberStatus={memberStatus}
        members={membersCache ?? []}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCreate={createRegistration}
        onUpdate={updateRegistration}
        onDelete={deleteRegistration}
        onCompetitionUpdated={async () => {
          await revalidateCompetitions();
          window.location.reload();
        }}
      />
    </div>
  );
}
