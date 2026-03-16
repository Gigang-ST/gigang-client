"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  updateMemberStatus,
  toggleAdmin,
} from "@/app/actions/admin/manage-member";
import {
  UserRound,
  Search,
  Shield,
  ShieldOff,
  UserX,
  UserCheck,
  ChevronRight,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Member = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  birthday: string | null;
  avatar_url: string | null;
  status: string | null;
  admin: boolean | null;
  joined_at: string | null;
};

type Filter = "all" | "active" | "inactive" | "pending";

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "활동", variant: "default" },
  inactive: { label: "비활성", variant: "destructive" },
  pending: { label: "대기", variant: "outline" },
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "active", label: "활동" },
  { value: "inactive", label: "비활성" },
  { value: "pending", label: "대기" },
];

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [actioning, setActioning] = useState(false);

  const loadMembers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("member")
      .select(
        "id, full_name, phone, email, gender, birthday, avatar_url, status, admin, joined_at",
      )
      .order("joined_at", { ascending: false });
    setMembers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const filtered = members.filter((m) => {
    if (filter !== "all" && m.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const nameMatch = m.full_name?.toLowerCase().includes(q);
      const phoneMatch = m.phone?.includes(q);
      if (!nameMatch && !phoneMatch) return false;
    }
    return true;
  });

  const handleStatusChange = async (
    memberId: string,
    status: "active" | "inactive",
  ) => {
    const label = status === "active" ? "활성화" : "비활성화";
    if (!confirm(`${label}하시겠습니까?`)) return;
    setActioning(true);
    const result = await updateMemberStatus(memberId, status);
    if (result.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, status } : m)),
      );
      setSelectedMember((prev) =>
        prev?.id === memberId ? { ...prev, status } : prev,
      );
    } else {
      alert(result.message);
    }
    setActioning(false);
  };

  const handleToggleAdmin = async (memberId: string, isAdmin: boolean) => {
    const label = isAdmin ? "관리자로 지정" : "관리자 해제";
    if (!confirm(`${label}하시겠습니까?`)) return;
    setActioning(true);
    const result = await toggleAdmin(memberId, isAdmin);
    if (result.ok) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId ? { ...m, admin: isAdmin } : m,
        ),
      );
      setSelectedMember((prev) =>
        prev?.id === memberId ? { ...prev, admin: isAdmin } : prev,
      );
    } else {
      alert(result.message);
    }
    setActioning(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-6 pt-4">
        <Skeleton className="h-8 w-32 rounded" />
        <Skeleton className="h-12 w-full rounded-xl" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <h1 className="text-[22px] font-bold tracking-tight text-foreground">
        회원 관리
      </h1>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 또는 전화번호 검색"
          className="h-12 rounded-xl border-[1.5px] pl-10 text-[15px]"
        />
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-0 rounded-xl bg-secondary p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors",
              filter === f.value
                ? "bg-foreground text-background"
                : "text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 회원 수 */}
      <span className="text-[13px] text-muted-foreground">
        {filtered.length}명
      </span>

      {/* 회원 목록 */}
      <div className="flex flex-col gap-2">
        {filtered.map((member) => {
          const badge = STATUS_BADGE[member.status ?? ""] ?? STATUS_BADGE.active;
          return (
            <button
              key={member.id}
              onClick={() => setSelectedMember(member)}
              className="flex items-center gap-3 rounded-2xl border-[1.5px] border-border p-4 text-left transition-colors active:bg-secondary"
            >
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary">
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRound className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold text-foreground">
                    {member.full_name ?? "이름 없음"}
                  </span>
                  {member.admin && (
                    <Shield className="size-3.5 text-primary" />
                  )}
                </div>
                <span className="text-[13px] text-muted-foreground">
                  {member.phone ?? "연락처 없음"}
                </span>
              </div>
              <Badge variant={badge.variant} className="shrink-0 text-[11px]">
                {badge.label}
              </Badge>
              <ChevronRight className="size-4 shrink-0 text-border" />
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <UserRound className="size-12 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">
            검색 결과가 없습니다
          </p>
        </div>
      )}

      {/* 회원 상세 시트 */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex flex-col">
          {/* 오버레이 */}
          <div
            className="flex-1 bg-black/40"
            onClick={() => setSelectedMember(null)}
          />
          {/* 시트 */}
          <div className="flex max-h-[80vh] flex-col overflow-y-auto rounded-t-3xl bg-white pb-8">
            {/* 핸들 */}
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>

            <div className="flex flex-col gap-6 px-6">
              {/* 헤더 */}
              <div className="flex items-center gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary">
                  {selectedMember.avatar_url ? (
                    <img
                      src={selectedMember.avatar_url}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <UserRound className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-foreground">
                      {selectedMember.full_name ?? "이름 없음"}
                    </span>
                    {selectedMember.admin && (
                      <Badge variant="default" className="text-[11px]">
                        관리자
                      </Badge>
                    )}
                  </div>
                  <Badge
                    variant={
                      (STATUS_BADGE[selectedMember.status ?? ""] ??
                        STATUS_BADGE.active
                      ).variant
                    }
                    className="w-fit text-[11px]"
                  >
                    {
                      (STATUS_BADGE[selectedMember.status ?? ""] ??
                        STATUS_BADGE.active
                      ).label
                    }
                  </Badge>
                </div>
                <button
                  onClick={() => setSelectedMember(null)}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* 정보 */}
              <div className="flex flex-col gap-3">
                <InfoRow label="연락처" value={selectedMember.phone} />
                <InfoRow label="이메일" value={selectedMember.email} />
                <InfoRow
                  label="성별"
                  value={
                    selectedMember.gender === "male"
                      ? "남성"
                      : selectedMember.gender === "female"
                        ? "여성"
                        : null
                  }
                />
                <InfoRow label="생년월일" value={selectedMember.birthday} />
                <InfoRow
                  label="가입일"
                  value={
                    selectedMember.joined_at
                      ? new Date(selectedMember.joined_at).toLocaleDateString(
                          "ko-KR",
                        )
                      : null
                  }
                />
              </div>

              {/* 액션 버튼 */}
              <div className="flex flex-col gap-2">
                {selectedMember.status === "active" && (
                  <button
                    onClick={() =>
                      handleStatusChange(selectedMember.id, "inactive")
                    }
                    disabled={actioning}
                    className="flex items-center gap-3 rounded-xl border-[1.5px] border-border px-4 py-3.5 text-left transition-colors active:bg-secondary disabled:opacity-50"
                  >
                    <UserX className="size-4 text-destructive" />
                    <span className="text-[15px] font-medium text-destructive">
                      비활성화
                    </span>
                  </button>
                )}
                {selectedMember.status === "inactive" && (
                  <button
                    onClick={() =>
                      handleStatusChange(selectedMember.id, "active")
                    }
                    disabled={actioning}
                    className="flex items-center gap-3 rounded-xl border-[1.5px] border-border px-4 py-3.5 text-left transition-colors active:bg-secondary disabled:opacity-50"
                  >
                    <UserCheck className="size-4 text-primary" />
                    <span className="text-[15px] font-medium text-primary">
                      활성화
                    </span>
                  </button>
                )}
                {selectedMember.admin ? (
                  <button
                    onClick={() =>
                      handleToggleAdmin(selectedMember.id, false)
                    }
                    disabled={actioning}
                    className="flex items-center gap-3 rounded-xl border-[1.5px] border-border px-4 py-3.5 text-left transition-colors active:bg-secondary disabled:opacity-50"
                  >
                    <ShieldOff className="size-4 text-muted-foreground" />
                    <span className="text-[15px] font-medium text-foreground">
                      관리자 해제
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      handleToggleAdmin(selectedMember.id, true)
                    }
                    disabled={actioning}
                    className="flex items-center gap-3 rounded-xl border-[1.5px] border-border px-4 py-3.5 text-left transition-colors active:bg-secondary disabled:opacity-50"
                  >
                    <Shield className="size-4 text-primary" />
                    <span className="text-[15px] font-medium text-foreground">
                      관리자 지정
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[14px] font-medium text-foreground">
        {value ?? "-"}
      </span>
    </div>
  );
}
