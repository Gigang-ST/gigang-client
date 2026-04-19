"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { approveMember, rejectMember } from "@/app/actions/admin/manage-member";
import { formatKoreanDate } from "@/lib/dayjs";
import { Check, X, UserRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { H2 } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";

type PendingMember = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  /** 승인 대기 목록 정렬·날짜 표시용. 재가입(onboardingRejoinFromInactive)은 join_dt를 안 바꾸므로 upd_at 사용 */
  queue_at: string | null;
};

export function AdminApprovalsClient({ teamId }: { teamId: string }) {
  const [members, setMembers] = useState<PendingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("team_mem_rel")
      .select(
        "mem_id, upd_at, mem_mst!inner(mem_nm, phone_no, avatar_url)",
      )
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "pending")
      .order("upd_at", { ascending: false });

    if (error) {
      setMembers([]);
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    type Mst = { mem_nm: string; phone_no: string | null; avatar_url: string | null };
    setMembers(
      (data ?? []).map((r) => {
        const m = r.mem_mst as unknown as Mst;
        return {
          id: r.mem_id,
          full_name: m.mem_nm,
          phone: m.phone_no,
          avatar_url: m.avatar_url,
          queue_at: r.upd_at,
        };
      }),
    );
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleApprove = async (id: string) => {
    setActioning(id);
    const result = await approveMember(id);
    if (result.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } else {
      alert(result.message);
    }
    setActioning(null);
  };

  const handleReject = async (id: string) => {
    if (!confirm("정말 거절하시겠습니까?")) return;
    setActioning(id);
    const result = await rejectMember(id);
    if (result.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
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

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <H2>가입 승인</H2>

      {loadError ? (
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-center text-[15px] text-destructive">
            목록을 불러오지 못했습니다.
            <br />
            <span className="text-[13px] text-muted-foreground">{loadError}</span>
          </p>
          <Button type="button" variant="outline" onClick={() => void loadMembers()}>
            다시 시도
          </Button>
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <UserRound className="size-12 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">
            승인 대기 중인 회원이 없습니다
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {members.map((member) => {
            const isActioning = actioning === member.id;
            return (
              <CardItem
                key={member.id}
                className="flex items-center gap-4"
              >
                {/* 아바타 */}
                <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary">
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <UserRound className="size-5 text-muted-foreground" />
                  )}
                </div>

                {/* 정보 */}
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-foreground">
                    {member.full_name ?? "이름 없음"}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {member.phone ?? "연락처 없음"}
                  </span>
                  {member.queue_at && (
                    <span className="text-[11px] text-muted-foreground/60">
                      {formatKoreanDate(member.queue_at.slice(0, 10), { year: "numeric", month: "long", day: "numeric" })}
                    </span>
                  )}
                </div>

                {/* 액션 버튼 */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleReject(member.id)}
                    disabled={isActioning}
                    className="rounded-xl text-muted-foreground"
                    aria-label="거절"
                  >
                    <X className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    onClick={() => handleApprove(member.id)}
                    disabled={isActioning}
                    className="rounded-xl"
                    aria-label="승인"
                  >
                    <Check className="size-4" />
                  </Button>
                </div>
              </CardItem>
            );
          })}
        </div>
      )}
    </div>
  );
}
