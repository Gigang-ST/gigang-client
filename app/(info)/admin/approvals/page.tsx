"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { approveMember, rejectMember } from "@/app/actions/member/manage";
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
  joined_at: string | null;
};

export default function ApprovalsPage() {
  const [members, setMembers] = useState<PendingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("member")
      .select("id, full_name, phone, avatar_url, joined_at")
      .eq("status", "pending")
      .order("joined_at", { ascending: false });
    setMembers(data ?? []);
    setLoading(false);
  }, []);

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

      {members.length === 0 ? (
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
                  {member.joined_at && (
                    <span className="text-[11px] text-muted-foreground/60">
                      {formatKoreanDate(member.joined_at.slice(0, 10), { year: "numeric", month: "long", day: "numeric" })}
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
