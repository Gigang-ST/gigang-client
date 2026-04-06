"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  fetchMemMstWithGigangRel,
  mapMstRelToAppMemberProfile,
} from "@/lib/queries/app-member";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { getPastGigangCompetitions } from "@/app/actions/get-past-gigang-competitions";
import { revalidateCompetitions } from "@/app/actions/revalidate-competitions";
import { CompetitionDetailDialog } from "./competition-detail-dialog";
import { CompetitionRegisterDialog } from "./competition-register-dialog";
import type { Competition, CompetitionRegistration, MemberStatus } from "./types";

const PAST_MONTHS_CHUNK = 3;

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
  initialMemberStatus,
  initialRegistrationsByCompetitionId,
  initialRegCounts,
}: {
  gigangCompetitions: Competition[];
  allCompetitions: Competition[];
  initialMemberStatus: MemberStatus;
  initialRegistrationsByCompetitionId: Record<string, CompetitionRegistration>;
  initialRegCounts: Record<string, number>;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("gigang");
  const [memberStatus, setMemberStatus] = useState<MemberStatus>(initialMemberStatus);
  const [registrationsByCompetitionId, setRegistrationsByCompetitionId] =
    useState<Record<string, CompetitionRegistration>>(initialRegistrationsByCompetitionId);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  // 지난 대회 (기강 참가만, 3개월씩)
  const [pastOpen, setPastOpen] = useState(false);
  const [pastCompetitions, setPastCompetitions] = useState<Competition[]>([]);
  const [pastLoading, setPastLoading] = useState(false);
  /** 다음 "이전 3개월 더 보기"에 쓸 날짜(구간 시작일). 목록이 비어 있어도 더 과거 구간 요청 가능 */
  const [pastNextBefore, setPastNextBefore] = useState<string | null>(null);
  const [regCounts, setRegCounts] = useState<Record<string, number>>(initialRegCounts);

  const loadRegCountsForIds = async (competitionIds: string[]) => {
    if (competitionIds.length === 0) return;
    const { data: countRows } = await supabase
      .from("team_comp_plan_rel")
      .select("comp_id, comp_reg_rel(count)")
      .eq("vers", 0)
      .eq("del_yn", false)
      .in("comp_id", competitionIds);

    setRegCounts((prev) => {
      const next = { ...prev };
      competitionIds.forEach((id) => { next[id] = 0; });
      (countRows ?? []).forEach((row) => {
        const comp = row as unknown as {
          comp_id: string;
          comp_reg_rel?: { count: number }[];
        };
        next[comp.comp_id] = comp.comp_reg_rel?.[0]?.count ?? 0;
      });
      return next;
    });
  };

  const loadMyRegsForIds = async (competitionIds: string[], memberId: string) => {
    if (competitionIds.length === 0) {
      setRegistrationsByCompetitionId({});
      return;
    }

    const { data: myRegs } = await supabase
      .from("comp_reg_rel")
      .select("comp_reg_id, mem_id, prt_role_cd, comp_evt_id, crt_at, team_comp_plan_rel!inner(comp_id), comp_evt_cfg(evt_cd)")
      .eq("mem_id", memberId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .in("team_comp_plan_rel.comp_id", competitionIds);

    const next: Record<string, CompetitionRegistration> = {};
    (myRegs ?? []).forEach((reg) => {
      const row = reg as unknown as {
        comp_reg_id: string;
        mem_id: string;
        prt_role_cd: "participant" | "cheering" | "volunteer";
        crt_at: string;
        team_comp_plan_rel: { comp_id: string }[] | { comp_id: string };
        comp_evt_cfg?: { evt_cd: string | null }[] | { evt_cd: string | null };
      };
      const plan = Array.isArray(row.team_comp_plan_rel) ? row.team_comp_plan_rel[0] : row.team_comp_plan_rel;
      const evt = Array.isArray(row.comp_evt_cfg) ? row.comp_evt_cfg[0] : row.comp_evt_cfg;
      if (!plan?.comp_id) return;
      next[plan.comp_id] = {
        id: row.comp_reg_id,
        competition_id: plan.comp_id,
        member_id: row.mem_id,
        role: row.prt_role_cd,
        event_type: evt?.evt_cd?.toUpperCase() ?? null,
        created_at: row.crt_at,
      };
    });
    setRegistrationsByCompetitionId(next);
  };

  const loadPastChunk = async (before: string) => {
    setPastLoading(true);
    try {
      const { list, nextBefore } = await getPastGigangCompetitions(before, PAST_MONTHS_CHUNK);
      setPastNextBefore(nextBefore);
      const prevIds = new Set(pastCompetitions.map((c) => c.id));
      const added = list.filter((c) => !prevIds.has(c.id));
      setPastCompetitions((prev) => [...prev, ...added].sort((a, b) => b.start_date.localeCompare(a.start_date)));
    } finally {
      setPastLoading(false);
    }
  };

  const handlePastToggle = () => {
    if (!pastOpen) {
      setPastOpen(true);
      if (pastNextBefore === null) {
        const today = new Date();
        const before = today.toISOString().slice(0, 10);
        loadPastChunk(before);
      }
    } else {
      setPastOpen(false);
    }
  };

  /** 이전 3개월 더 보기: pastNextBefore(서버에서 준 다음 구간 시작일)로 그 이전 3개월 조회. 목록 비어 있어도 버튼 노출 */
  const loadMorePast = () => {
    const before = pastNextBefore ?? pastCompetitions.reduce((min, c) => (c.start_date < min ? c.start_date : min), pastCompetitions[0]?.start_date ?? "");
    if (!before) return;
    loadPastChunk(before);
  };

  const competitions = tab === "gigang" ? gigangCompetitions : allCompetitions;
  const allCompetitionIds = useMemo(
    () => [...new Set([...competitions.map((c) => c.id), ...(pastOpen ? pastCompetitions.map((c) => c.id) : [])])],
    [competitions, pastOpen, pastCompetitions],
  );

  useEffect(() => {
    let active = true;

    async function loadMember() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!active) return;

      if (error || !user) {
        setMemberStatus({ status: "signed-out" });
        return;
      }

      const bundle = await fetchMemMstWithGigangRel(supabase, user.id);
      if (!active) return;

      if (!bundle) {
        setMemberStatus({ status: "needs-onboarding", userId: user.id });
        return;
      }

      const profile = mapMstRelToAppMemberProfile(bundle.mst, bundle.rel);
      setMemberStatus({
        status: "ready",
        userId: user.id,
        memberId: profile.id,
        fullName: profile.full_name ?? null,
        email: profile.email ?? null,
        admin: profile.admin ?? false,
      });
    }

    loadMember();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    loadRegCountsForIds(allCompetitionIds);
  }, [allCompetitionIds]);

  useEffect(() => {
    if (memberStatus.status !== "ready") {
      setRegistrationsByCompetitionId({});
      return;
    }
    loadMyRegsForIds(allCompetitionIds, memberStatus.memberId);
  }, [allCompetitionIds, memberStatus.status, memberStatus.status === "ready" ? memberStatus.memberId : null]);


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

  const createRegistration = async (competitionId: string, payload: { role: "participant" | "cheering" | "volunteer"; eventType: string }) => {
    if (memberStatus.status !== "ready") return { ok: false as const, message: "로그인이 필요합니다." };
    const eventType = payload.role === "participant" ? payload.eventType.trim().toUpperCase() : null;
    const { data: plan, error: planErr } = await supabase
      .from("team_comp_plan_rel")
      .select("team_comp_id")
      .eq("comp_id", competitionId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (planErr || !plan) return { ok: false as const, message: "신청에 실패했습니다." };
    const { data, error } = await supabase
      .from("comp_reg_rel")
      .insert({ team_comp_id: plan.team_comp_id, mem_id: memberStatus.memberId, prt_role_cd: payload.role, vers: 0, del_yn: false })
      .select("comp_reg_id, mem_id, prt_role_cd, crt_at").single();
    if (error) return { ok: false as const, message: "신청에 실패했습니다." };
    setRegistrationsByCompetitionId(prev => ({ ...prev, [competitionId]: { id: data.comp_reg_id, competition_id: competitionId, member_id: data.mem_id, role: data.prt_role_cd as "participant" | "cheering" | "volunteer", event_type: eventType, created_at: data.crt_at } }));
    setRegCounts(prev => ({ ...prev, [competitionId]: (prev[competitionId] ?? 0) + 1 }));
    await revalidateCompetitions();
    router.refresh();

    return { ok: true as const, message: "참가 신청 완료" };
  };

  const updateRegistration = async (registrationId: string, competitionId: string, payload: { role: "participant" | "cheering" | "volunteer"; eventType: string }) => {
    if (memberStatus.status !== "ready") return { ok: false as const, message: "로그인이 필요합니다." };
    const eventType = payload.role === "participant" ? payload.eventType.trim().toUpperCase() : null;
    const { data, error } = await supabase.from("comp_reg_rel")
      .update({ prt_role_cd: payload.role }).eq("comp_reg_id", registrationId)
      .select("comp_reg_id, mem_id, prt_role_cd, crt_at").single();
    if (error) return { ok: false as const, message: "수정에 실패했습니다." };
    setRegistrationsByCompetitionId(prev => ({ ...prev, [competitionId]: { id: data.comp_reg_id, competition_id: competitionId, member_id: data.mem_id, role: data.prt_role_cd as "participant" | "cheering" | "volunteer", event_type: eventType, created_at: data.crt_at } }));
    return { ok: true as const, message: "업데이트 완료" };
  };

  const deleteRegistration = async (registrationId: string, competitionId: string) => {
    if (memberStatus.status !== "ready") return { ok: false as const, message: "로그인이 필요합니다." };
    const { error } = await supabase.from("comp_reg_rel").delete().eq("comp_reg_id", registrationId).eq("mem_id", memberStatus.memberId);
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
                  <CardItem
                    asChild
                    key={comp.id}
                    className={cn(
                      "flex w-full items-center gap-4",
                      isRegistered
                        ? "border-primary bg-primary/5"
                        : "border-border",
                    )}
                  >
                    <button
                      onClick={() => { setSelectedCompetition(comp); setDetailOpen(true); }}
                      className="text-left transition-colors"
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
                  </CardItem>
                );
              })}
            </div>
          ))
        )}

        {/* 지난 대회 토글 — 기강대회 탭에서만 (지난 대회는 기강 참가만 조회) */}
        {tab === "gigang" && (
          <div className="pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handlePastToggle}
              disabled={pastLoading}
              className="h-auto gap-1 px-0 py-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              {pastOpen ? (
                <>
                  <ChevronDown className="size-3.5 rotate-180" />
                  지난 대회 접기
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5" />
                  지난 대회 보기
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* 지난 대회 (기강 참가만, 최근 3개월씩) — 기강대회 탭 + 토글 열었을 때만 */}
      {tab === "gigang" && pastOpen && (
        <div className="flex flex-col gap-4 px-6 pb-6">
          <h3 className="text-base font-semibold text-foreground">지난 대회</h3>
          {pastLoading && pastCompetitions.length === 0 && pastNextBefore === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : pastCompetitions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">해당 기간 지난 대회가 없습니다. 아래에서 이전 구간을 불러올 수 있습니다.</p>
          ) : (
            (() => {
              const pastGrouped = (() => {
                const map = new Map<string, Competition[]>();
                pastCompetitions.forEach(c => {
                  const d = new Date(c.start_date);
                  const key = `${d.getFullYear()}-${d.getMonth()}`;
                  const list = map.get(key) ?? [];
                  list.push(c);
                  map.set(key, list);
                });
                return Array.from(map.entries()).map(([key, items]) => {
                  const [year, month] = key.split("-").map(Number);
                  return { year, month, label: `${year}년 ${month + 1}월`, items };
                }).sort((a, b) => b.year - a.year || b.month - a.month);
              })();
              return pastGrouped.map(group => (
                <div key={`${group.year}-${group.month}`} className="flex flex-col gap-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">{group.label}</h4>
                  {group.items.map(comp => {
                    const d = new Date(comp.start_date);
                    const isRegistered = Boolean(registrationsByCompetitionId[comp.id]);
                    const regCount = regCounts[comp.id] ?? 0;
                    return (
                      <CardItem
                        asChild
                        key={comp.id}
                        className={cn(
                          "flex w-full items-center gap-4",
                          isRegistered ? "border-primary bg-primary/5" : "border-border",
                        )}
                      >
                        <button
                          onClick={() => { setSelectedCompetition(comp); setDetailOpen(true); }}
                          className="text-left transition-colors"
                        >
                        <div className="flex w-12 shrink-0 flex-col items-center gap-0.5">
                          <span className="text-[11px] font-semibold text-primary">{MONTHS_EN[d.getMonth()]}</span>
                          <span className="text-xl font-bold text-foreground">{String(d.getDate()).padStart(2, "0")}</span>
                        </div>
                        <div className="h-12 w-px shrink-0 bg-primary/20" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="truncate text-[15px] font-semibold text-foreground">{comp.title}</span>
                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {comp.sport && SPORT_LABEL[comp.sport] && (
                              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", SPORT_LABEL[comp.sport].className)}>
                                {SPORT_LABEL[comp.sport].label}
                              </span>
                            )}
                            {comp.location && <span>{comp.location}</span>}
                            {regCount > 0 && (
                              <span className="font-medium text-primary">{regCount}명 참여</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                        </button>
                      </CardItem>
                    );
                  })}
                </div>
              ));
            })()
          )}
          {/* 목록이 비어 있어도 다음 구간이 있으면 버튼 표시 (작년 7월 등 더 과거 로드 가능) */}
          {pastNextBefore !== null && (
            <Button
              type="button"
              variant="outline"
              onClick={loadMorePast}
              disabled={pastLoading}
              className="w-full rounded-xl border-dashed py-2.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              {pastLoading ? "불러오는 중..." : "이전 3개월 더 보기"}
            </Button>
          )}
        </div>
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
        onCompetitionUpdated={async () => { await revalidateCompetitions(); router.refresh(); }}
      />

      {/* FAB: 대회 등록 */}
      <Button
        onClick={() => setRegisterOpen(true)}
        size="icon-lg"
        className="fixed bottom-24 right-5 z-40 size-14 rounded-full shadow-lg active:scale-95"
      >
        <Plus className="size-6" />
      </Button>

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
