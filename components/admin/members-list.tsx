"use client";

import { useState } from "react";
import {
  updateMemberStatus,
  toggleAdmin,
} from "@/app/actions/admin/manage-member";
import {
  Search,
  Shield,
  ShieldOff,
  UserRound,
  UserX,
  UserCheck,
  ChevronRight,
  X,
} from "lucide-react";
import { Avatar } from "@/components/common/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { H2 } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { CardItem } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MemberListItem } from "@/lib/queries/admin-data";

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

export function MembersList({
  initialMembers,
}: {
  initialMembers: MemberListItem[];
}) {
  const [members, setMembers] = useState<MemberListItem[]>(initialMembers);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<MemberListItem | null>(null);
  const [actioning, setActioning] = useState(false);

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

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <H2>회원 관리</H2>

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
          <Button
            key={f.value}
            variant="ghost"
            size="sm"
            onClick={() => setFilter(f.value)}
            className={cn(
              "flex-1 rounded-lg text-[13px] font-medium",
              filter === f.value
                ? "bg-foreground text-background hover:bg-foreground hover:text-background"
                : "text-muted-foreground",
            )}
          >
            {f.label}
          </Button>
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
            <CardItem asChild key={member.id} className="flex items-center gap-3">
              <button
                onClick={() => setSelectedMember(member)}
                className="text-left transition-colors active:bg-secondary"
              >
              <Avatar src={member.avatar_url} size="md" />
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
            </CardItem>
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
                <Avatar src={selectedMember.avatar_url} size="lg" />
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setSelectedMember(null)}
                  className="text-muted-foreground"
                >
                  <X className="size-5" />
                </Button>
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
                  <Button
                    variant="outline"
                    onClick={() =>
                      handleStatusChange(selectedMember.id, "inactive")
                    }
                    disabled={actioning}
                    className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                  >
                    <UserX className="size-4 text-destructive" />
                    <span className="text-[15px] font-medium text-destructive">
                      비활성화
                    </span>
                  </Button>
                )}
                {selectedMember.status === "inactive" && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      handleStatusChange(selectedMember.id, "active")
                    }
                    disabled={actioning}
                    className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                  >
                    <UserCheck className="size-4 text-primary" />
                    <span className="text-[15px] font-medium text-primary">
                      활성화
                    </span>
                  </Button>
                )}
                {selectedMember.admin ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      handleToggleAdmin(selectedMember.id, false)
                    }
                    disabled={actioning}
                    className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                  >
                    <ShieldOff className="size-4 text-muted-foreground" />
                    <span className="text-[15px] font-medium text-foreground">
                      관리자 해제
                    </span>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() =>
                      handleToggleAdmin(selectedMember.id, true)
                    }
                    disabled={actioning}
                    className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                  >
                    <Shield className="size-4 text-primary" />
                    <span className="text-[15px] font-medium text-foreground">
                      관리자 지정
                    </span>
                  </Button>
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
