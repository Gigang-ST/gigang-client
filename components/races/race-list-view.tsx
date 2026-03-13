"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { revalidateCompetitions } from "@/app/actions/revalidate-competitions";
import { CompetitionDetailDialog } from "./competition-detail-dialog";
import { CompetitionRegisterDialog } from "./competition-register-dialog";
import type { Competition, CompetitionRegistration, MemberStatus } from "./types";

type Tab = "gigang" | "all";

const MONTHS_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const SPORT_LABEL: Record<string, { label: string; className: string }> = {
  road_run: { label: "마라톤", className: "bg-blue-50 text-blue-600" },
  triathlon: { label: "트라이애슬론", className: "bg-emerald-50 text-emerald-600" },
  trail_run: { label: "트레일러닝", className: "bg-amber-50 text-amber-600" },
};

export function RaceListView({
  gigangCompetitions,
  allCompetitions,
}: {
  gigangCompetitions: Competition[];
  allCompetitions: Competition[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("gigang");
  const [memberStatus, setMemberStatus] = useState<MemberStatus>({ status: "loading" });
  const [registrationsByCompetitionId, setRegistrationsByCompetitionId] =
    useState<Record<string, CompetitionRegistration>>({});
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  // Load member
  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!active) return;
      if (error || !user) { setMemberStatus({ status: "signed-out" }); return; }
      const { data: member } = await supabase
        .from("member").select("id, full_name, email, admin")
        .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
        .maybeSingle();
      if (!active) return;
      if (!member) { setMemberStatus({ status: "needs-onboarding", userId: user.id }); return; }
      setMemberStatus({ status: "ready", userId: user.id, memberId: member.id, fullName: member.full_name ?? null, email: member.email ?? null, admin: member.admin ?? false });
    }
    load();
    return () => { active = false; };
  }, [supabase]);

  const competitions = tab === "gigang" ? gigangCompetitions : allCompetitions;

  // Load registrations
  useEffect(() => {
    let active = true;
    async function load() {
      if (memberStatus.status !== "ready" || competitions.length === 0) {
        setRegistrationsByCompetitionId({});
        return;
      }
      const { data } = await supabase
        .from("competition_registration")
        .select("id, competition_id, member_id, role, event_type, created_at")
        .eq("member_id", memberStatus.memberId)
        .in("competition_id", competitions.map(c => c.id));
      if (!active) return;
      const map: Record<string, CompetitionRegistration> = {};
      (data ?? []).forEach((r) => { map[r.competition_id] = r as CompetitionRegistration; });
      setRegistrationsByCompetitionId(map);
    }
    load();
    return () => { active = false; };
  }, [competitions, memberStatus, supabase]);

  // Group by year-month
  const grouped = useMemo(() => {
    const map = new Map<string, Competition[]>();
    competitions.forEach(c => {
      const d = new Date(c.start_date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    });
    return Array.from(map.entries()).map(([key, items]) => {
      const [year, month] = key.split("-").map(Number);
      return { year, month, label: `${year}년 ${month + 1}월`, items };
    });
  }, [competitions]);

  // Registration count per competition
  const [regCounts, setRegCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let active = true;
    async function load() {
      if (competitions.length === 0) return;
      const { data } = await supabase
        .from("competition_registration")
        .select("competition_id")
        .in("competition_id", competitions.map(c => c.id));
      if (!active || !data) return;
      const counts: Record<string, number> = {};
      data.forEach(r => { counts[r.competition_id] = (counts[r.competition_id] ?? 0) + 1; });
      setRegCounts(counts);
    }
    load();
    return () => { active = false; };
  }, [competitions, supabase]);

  const createRegistration = async (competitionId: string, payload: { role: "participant" | "cheering" | "volunteer"; eventType: string }) => {
    if (memberStatus.status !== "ready") return { ok: false as const, message: "로그인이 필요합니다." };
    const eventType = payload.role === "participant" ? payload.eventType.trim().toUpperCase() : null;
    const { data, error } = await supabase.from("competition_registration")
      .insert({ competition_id: competitionId, member_id: memberStatus.memberId, role: payload.role, event_type: eventType })
      .select("id, competition_id, member_id, role, event_type, created_at").single();
    if (error) return { ok: false as const, message: "신청에 실패했습니다." };
    setRegistrationsByCompetitionId(prev => ({ ...prev, [competitionId]: data as CompetitionRegistration }));
    setRegCounts(prev => ({ ...prev, [competitionId]: (prev[competitionId] ?? 0) + 1 }));
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
    if (memberStatus.status !== "ready") return { ok: false as const, message: "로그인이 필요합니다." };
    const { error } = await supabase.from("competition_registration").delete().eq("id", registrationId).eq("member_id", memberStatus.memberId);
    if (error) return { ok: false as const, message: "취소에 실패했습니다." };
    setRegistrationsByCompetitionId(prev => { const next = { ...prev }; delete next[competitionId]; return next; });
    const newCount = (regCounts[competitionId] ?? 1) - 1;
    setRegCounts(prev => {
      const updated = (prev[competitionId] ?? 1) - 1;
      return { ...prev, [competitionId]: updated };
    });
    if (newCount <= 0) {
      await revalidateCompetitions();
      router.refresh();
    }
    return { ok: true as const, message: "취소 완료" };
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Segment Control */}
      <div className="flex items-center gap-0 px-6">
        {([
          { value: "gigang" as Tab, label: "기강대회" },
          { value: "all" as Tab, label: "전체" },
        ]).map(seg => (
          <button
            key={seg.value}
            onClick={() => setTab(seg.value)}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
              tab === seg.value
                ? "bg-foreground text-background"
                : "text-muted-foreground",
            )}
          >
            {seg.label}
          </button>
        ))}
      </div>

      {/* Race List */}
      <div className="flex flex-col gap-4 px-6 pt-4 pb-6">
        {grouped.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            대회가 없습니다
          </p>
        ) : (
          grouped.map(group => (
            <div key={`${group.year}-${group.month}`} className="flex flex-col gap-3">
              <h3 className="text-base font-semibold text-foreground">
                {group.label}
              </h3>
              {group.items.map(comp => {
                const d = new Date(comp.start_date);
                const isRegistered = Boolean(registrationsByCompetitionId[comp.id]);
                const regCount = regCounts[comp.id] ?? 0;
                return (
                  <button
                    key={comp.id}
                    onClick={() => { setSelectedCompetition(comp); setDetailOpen(true); }}
                    className={cn(
                      "flex w-full items-center gap-4 rounded-2xl border-[1.5px] p-4 text-left transition-colors",
                      isRegistered
                        ? "border-primary bg-primary/5"
                        : "border-border",
                    )}
                  >
                    <div className="flex w-12 shrink-0 flex-col items-center gap-0.5">
                      <span className="text-[11px] font-semibold text-primary">
                        {MONTHS_EN[d.getMonth()]}
                      </span>
                      <span className="text-xl font-bold text-foreground">
                        {String(d.getDate()).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="h-12 w-px shrink-0 bg-primary/20" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="truncate text-[15px] font-semibold text-foreground">
                        {comp.title}
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {comp.sport && SPORT_LABEL[comp.sport] && (
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", SPORT_LABEL[comp.sport].className)}>
                            {SPORT_LABEL[comp.sport].label}
                          </span>
                        )}
                        {comp.location && <span>{comp.location}</span>}
                        {regCount > 0 && (
                          <span className="font-medium text-primary">
                            {regCount}명 참여
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <CompetitionDetailDialog
        competition={selectedCompetition}
        registration={selectedCompetition ? registrationsByCompetitionId[selectedCompetition.id] : undefined}
        memberStatus={memberStatus}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCreate={createRegistration}
        onUpdate={updateRegistration}
        onDelete={deleteRegistration}
        onCompetitionUpdated={async () => { await revalidateCompetitions(); router.refresh(); }}
      />

      {/* FAB: 대회 등록 */}
      <button
        onClick={() => setRegisterOpen(true)}
        className="fixed bottom-24 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
      >
        <Plus className="size-6" />
      </button>

      <CompetitionRegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        memberStatus={memberStatus}
        onCreated={async () => {
          await revalidateCompetitions();
          router.refresh();
        }}
      />
    </div>
  );
}
