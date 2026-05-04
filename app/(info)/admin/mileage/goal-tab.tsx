"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateMonthlyGoal } from "@/app/actions/mileage-run";
import { ChevronDown, ChevronUp, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CardItem } from "@/components/ui/card";
import { Body, Caption } from "@/components/common/typography";
import { EmptyState } from "@/components/common/empty-state";

type ParticipantRow = {
  prt_id: string;
  mem_id: string;
  mem_nm: string | null;
  stt_mth: string;
};

type MonthlyGoalRow = {
  goal_id: string;
  base_dt: string;
  goal_mlg: number;
  achv_mlg: number;
  achv_yn: boolean;
};

export function GoalTab({ evtId }: { evtId: string }) {
  const [members, setMembers] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [monthlyGoals, setMonthlyGoals] = useState<Record<string, MonthlyGoalRow[]>>({});
  const [loadingGoals, setLoadingGoals] = useState<string | null>(null);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data: prtData } = await supabase
      .from("evt_team_prt_rel")
      .select("prt_id, mem_id, stt_mth")
      .eq("evt_id", evtId)
      .eq("aprv_yn", true)
      .order("stt_mth", { ascending: true });

    if (!prtData || prtData.length === 0) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const memIds = [...new Set(prtData.map((p) => p.mem_id))];
    const { data: memData } = await supabase
      .from("mem_mst")
      .select("mem_id, mem_nm")
      .in("mem_id", memIds);

    const memNameById = new Map((memData ?? []).map((m) => [m.mem_id, m.mem_nm]));

    setMembers(
      prtData.map((p) => ({
        prt_id: p.prt_id,
        mem_id: p.mem_id,
        mem_nm: memNameById.get(p.mem_id) ?? null,
        stt_mth: p.stt_mth,
      })),
    );
    setLoading(false);
  }, [evtId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const loadMonthlyGoals = useCallback(async (prtId: string) => {
    setLoadingGoals(prtId);
    const supabase = createClient();
    const { data } = await supabase
      .from("evt_mlg_mth_snap")
      .select("goal_id, base_dt, goal_mlg, achv_mlg, achv_yn")
      .eq("prt_id", prtId)
      .order("base_dt", { ascending: true });

    setMonthlyGoals((prev) => ({
      ...prev,
      [prtId]: (data ?? []).map((g) => ({
        goal_id: g.goal_id,
        base_dt: g.base_dt as string,
        goal_mlg: Number(g.goal_mlg),
        achv_mlg: Number(g.achv_mlg),
        achv_yn: g.achv_yn ?? false,
      })),
    }));
    setLoadingGoals(null);
  }, []);

  const handleExpand = async (prtId: string) => {
    if (expandedId === prtId) {
      setExpandedId(null);
      setEditingGoalId(null);
      return;
    }
    setExpandedId(prtId);
    setEditingGoalId(null);
    if (!monthlyGoals[prtId]) {
      await loadMonthlyGoals(prtId);
    }
  };

  const openEdit = (goal: MonthlyGoalRow) => {
    setEditingGoalId(goal.goal_id);
    setEditValue(String(goal.goal_mlg));
  };

  const cancelEdit = () => {
    setEditingGoalId(null);
    setEditValue("");
  };

  const handleSave = async (prtId: string, goalId: string) => {
    const newGoal = Number(editValue);
    if (isNaN(newGoal) || newGoal < 0) {
      alert("유효한 목표값을 입력하세요");
      return;
    }
    setSaving(true);
    const result = await updateMonthlyGoal(goalId, newGoal);
    setSaving(false);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    cancelEdit();
    // 재계산 결과 반영을 위해 해당 회원 월별 목표 전체 재조회
    await loadMonthlyGoals(prtId);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <EmptyState
        variant="card"
        message="승인된 참여자가 없습니다. 참여자 탭에서 먼저 승인하세요."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {members.map((member) => {
        const isExpanded = expandedId === member.prt_id;
        const goals = monthlyGoals[member.prt_id] ?? [];
        const isLoadingGoals = loadingGoals === member.prt_id;

        return (
          <CardItem key={member.prt_id} className="flex flex-col gap-0">
            <button
              className="flex w-full items-center gap-3 text-left"
              onClick={() => handleExpand(member.prt_id)}
            >
              <div className="flex flex-1 flex-col gap-0.5">
                <Body className="font-semibold">{member.mem_nm ?? "이름 없음"}</Body>
                <Caption>{member.stt_mth?.slice(0, 7)} 시작</Caption>
              </div>
              {isExpanded ? (
                <ChevronUp className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" />
              )}
            </button>

            {isExpanded && (
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                {isLoadingGoals ? (
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full rounded-lg" />
                    ))}
                  </div>
                ) : goals.length === 0 ? (
                  <Caption>등록된 월별 목표가 없습니다</Caption>
                ) : (
                  goals.map((goal) => {
                    const isEditing = editingGoalId === goal.goal_id;
                    return (
                      <div key={goal.goal_id} className="flex items-center gap-2">
                        <span className="w-[4.5rem] shrink-0 text-[13px] text-muted-foreground">
                          {goal.base_dt.slice(0, 7)}
                        </span>
                        <Badge
                          variant={goal.achv_yn ? "default" : "outline"}
                          className="shrink-0 text-[10px]"
                        >
                          {goal.achv_yn ? "달성" : "미달성"}
                        </Badge>
                        <span className="shrink-0 text-[12px] text-muted-foreground">
                          {goal.achv_mlg.toLocaleString()}km /
                        </span>

                        {isEditing ? (
                          <div className="flex flex-1 items-center gap-1.5">
                            <Input
                              type="number"
                              min="0"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="h-7 w-20 rounded-md text-center text-[13px]"
                              autoFocus
                            />
                            <span className="text-[12px] text-muted-foreground">km</span>
                            <Button
                              size="icon-sm"
                              onClick={() => handleSave(member.prt_id, goal.goal_id)}
                              disabled={saving}
                              className="rounded-md"
                              aria-label="저장"
                            >
                              <Check className="size-3" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="outline"
                              onClick={cancelEdit}
                              disabled={saving}
                              className="rounded-md"
                              aria-label="취소"
                            >
                              <X className="size-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-1 items-center">
                            <span className="text-[13px] font-semibold text-foreground">
                              {goal.goal_mlg.toLocaleString()}km
                            </span>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => openEdit(goal)}
                              className="ml-auto rounded-md"
                              aria-label="목표 수정"
                            >
                              <Pencil className="size-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </CardItem>
        );
      })}
    </div>
  );
}
