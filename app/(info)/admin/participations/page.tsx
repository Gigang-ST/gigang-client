"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getPendingParticipations,
  getConfirmedParticipations,
  confirmDeposit,
  rejectParticipation,
  type PendingParticipation,
  type ConfirmedParticipation,
} from "@/app/actions/admin/manage-participation";
import { Check, X, UserRound, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function calcAmount(
  startMonth: string,
  endMonth: string,
  projectStartMonth: string,
  singletFeePaid: boolean,
) {
  // 참여 시작월은 프로젝트 시작월 이후부터만 유효
  const effectiveStart = startMonth > projectStartMonth ? startMonth : projectStartMonth;
  const [sy, sm] = effectiveStart.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  const months = Math.max((ey - sy) * 12 + (em - sm) + 1, 1);
  const deposit = months * 10000;
  const entryFee = singletFeePaid ? 10000 : 20000;
  return { months, deposit, entryFee, total: deposit + entryFee };
}

export default function ParticipationsPage() {
  const [pending, setPending] = useState<PendingParticipation[]>([]);
  const [confirmed, setConfirmed] = useState<ConfirmedParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectStartMonth, setProjectStartMonth] = useState<string | null>(null);
  const [projectEndMonth, setProjectEndMonth] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: project } = await supabase
      .from("project")
      .select("id, start_month, end_month")
      .eq("status", "active")
      .maybeSingle();

    if (!project) {
      setLoading(false);
      return;
    }

    setProjectId(project.id);
    setProjectStartMonth(project.start_month as string);
    setProjectEndMonth(project.end_month as string);

    const [pendingResult, confirmedResult] = await Promise.all([
      getPendingParticipations(project.id),
      getConfirmedParticipations(project.id),
    ]);

    if (pendingResult.ok) setPending(pendingResult.data);
    if (confirmedResult.ok) setConfirmed(confirmedResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (id: string) => {
    setActioning(id);
    const result = await confirmDeposit(id);
    if (result.ok) {
      // 승인된 항목을 대기 목록에서 참여자 목록으로 이동
      const approved = pending.find((p) => p.id === id);
      setPending((prev) => prev.filter((p) => p.id !== id));
      if (approved) {
        setConfirmed((prev) => [...prev, approved]);
      }
    } else {
      alert(result.message);
    }
    setActioning(null);
  };

  const handleReject = async (id: string) => {
    if (!confirm("정말 거절하시겠습니까? 참여 신청이 삭제됩니다.")) return;
    setActioning(id);
    const result = await rejectParticipation(id);
    if (result.ok) {
      setPending((prev) => prev.filter((p) => p.id !== id));
    } else {
      alert(result.message);
    }
    setActioning(null);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-6 pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">
          프로젝트 참여자 관리
        </h1>
        <div className="flex flex-col items-center gap-3 py-16">
          <UserRound className="size-12 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">
            활성 프로젝트가 없습니다
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 px-6 pb-6 pt-4">
      <h1 className="text-[22px] font-bold tracking-tight text-foreground">
        프로젝트 참여자 관리
      </h1>

      {/* 섹션 1: 승인 대기 */}
      <section className="flex flex-col gap-3">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground">
          승인 대기
        </span>

        {pending.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <UserRound className="size-10 text-muted-foreground/30" />
            <p className="text-[14px] text-muted-foreground">
              승인 대기 중인 신청이 없습니다
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((p) => {
              const isActioning = actioning === p.id;
              const amount = projectStartMonth && projectEndMonth
                ? calcAmount(p.start_month, projectEndMonth, projectStartMonth, p.singlet_fee_paid)
                : null;
              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-border p-4"
                >
                  <div className="flex items-center gap-4">
                    {/* 아바타 */}
                    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary">
                      <UserRound className="size-5 text-muted-foreground" />
                    </div>

                    {/* 정보 */}
                    <div className="flex flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold text-foreground">
                        {p.member?.full_name ?? "이름 없음"}
                      </span>
                      <span className="text-[13px] text-muted-foreground">
                        초기 목표: {p.initial_goal}km
                      </span>
                      <span className="text-[11px] text-muted-foreground/60">
                        {new Date(p.created_at).toLocaleDateString("ko-KR")}
                      </span>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(p.id)}
                        disabled={isActioning}
                        className="flex size-10 items-center justify-center rounded-xl border-[1.5px] border-border text-muted-foreground transition-colors active:bg-secondary disabled:opacity-50"
                        aria-label="거절"
                      >
                        <X className="size-4" />
                      </button>
                      <button
                        onClick={() => handleApprove(p.id)}
                        disabled={isActioning}
                        className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors active:bg-primary/90 disabled:opacity-50"
                        aria-label="승인"
                      >
                        <Check className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* 납부 금액 상세 */}
                  {amount && (
                    <div className="rounded-lg bg-muted/50 px-3 py-2 text-[13px] text-muted-foreground space-y-0.5">
                      <div className="flex justify-between">
                        <span>보증금 ({amount.months}개월)</span>
                        <span>{amount.deposit.toLocaleString()}원</span>
                      </div>
                      <div className="flex justify-between">
                        <span>참가비{p.singlet_fee_paid ? " (싱글렛 할인)" : ""}</span>
                        <span>{amount.entryFee.toLocaleString()}원</span>
                      </div>
                      <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1 mt-1">
                        <span>합계</span>
                        <span>{amount.total.toLocaleString()}원</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 섹션 2: 참여자 목록 */}
      <section className="flex flex-col gap-3">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground">
          참여자 목록
        </span>

        {confirmed.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Users className="size-10 text-muted-foreground/30" />
            <p className="text-[14px] text-muted-foreground">
              아직 참여자가 없습니다
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {confirmed.map((p) => {
              const amount = projectStartMonth && projectEndMonth
                ? calcAmount(p.start_month, projectEndMonth, projectStartMonth, p.singlet_fee_paid)
                : null;
              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-border p-4"
                >
                  <div className="flex items-center gap-4">
                    {/* 아바타 */}
                    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary">
                      <UserRound className="size-5 text-muted-foreground" />
                    </div>

                    {/* 정보 */}
                    <div className="flex flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold text-foreground">
                        {p.member?.full_name ?? "이름 없음"}
                      </span>
                      <span className="text-[13px] text-muted-foreground">
                        초기 목표: {p.initial_goal}km · 시작: {p.start_month}
                      </span>
                      <span className="text-[11px] text-muted-foreground/60">
                        싱글렛: {p.singlet_fee_paid ? "보유" : "미보유"}
                      </span>
                    </div>

                    {/* 납부 금액 */}
                    {amount && (
                      <span className="text-[15px] font-semibold text-foreground">
                        {amount.total.toLocaleString()}원
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
