"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { grantTitle } from "@/app/actions/admin/grant-title";
import {
  toggleAdmin,
  deleteMember,
} from "@/app/actions/admin/manage-member";
import { revokeTitle } from "@/app/actions/admin/revoke-title";
import {
  Search,
  Shield,
  ShieldOff,
  UserRound,
  UserX,
  ChevronRight,
  X,
} from "lucide-react";
import { Avatar } from "@/components/common/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { H2, Body, Caption, SectionLabel } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CardItem } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { dayjs } from "@/lib/dayjs";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

type Member = {
  id: string;
  team_mem_id: string;
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

type MemberTitle = {
  mem_ttl_id: string;
  ttl_nm: string;
  grnt_at: string;
  grnt_by_mem_id: string | null;
};

type AwardableTitle = {
  ttl_id: string;
  ttl_nm: string;
};

// ---------------------------------------------------------------------------
// 수여 패널 — 검색 필터 + 선택
// ---------------------------------------------------------------------------

function GrantPanel({
  awardableTitles,
  loadingAwardable,
  selectedTtlId,
  onSelect,
  granting,
  onGrant,
  onCancel,
}: {
  awardableTitles: AwardableTitle[];
  loadingAwardable: boolean;
  selectedTtlId: string;
  onSelect: (id: string) => void;
  granting: boolean;
  onGrant: () => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = awardableTitles.filter((t) =>
    t.ttl_nm.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <CardItem className="flex flex-col gap-3 p-4">
      {loadingAwardable ? (
        <Skeleton className="h-10 w-full rounded-lg" />
      ) : awardableTitles.length === 0 ? (
        <Caption>수여 가능한 칭호가 없습니다.</Caption>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="칭호명 검색"
              className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-[13px] outline-none focus:border-primary"
            />
          </div>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <Caption className="py-2 text-center">검색 결과 없음</Caption>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.ttl_id}
                  onClick={() => onSelect(t.ttl_id)}
                  className={
                    "rounded-lg px-3 py-2 text-left text-[13px] transition-colors " +
                    (selectedTtlId === t.ttl_id
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-foreground hover:bg-secondary")
                  }
                >
                  {t.ttl_nm}
                </button>
              ))
            )}
          </div>
        </>
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
          취소
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={!selectedTtlId || granting}
          onClick={onGrant}
        >
          {granting ? "수여 중..." : "확인"}
        </Button>
      </div>
    </CardItem>
  );
}

// ---------------------------------------------------------------------------
// 칭호 섹션 컴포넌트
// ---------------------------------------------------------------------------

function TitleSection({
  member,
  teamId,
}: {
  member: Member;
  teamId: string;
}) {
  const [titles, setTitles] = useState<MemberTitle[]>([]);
  const [loadingTitles, setLoadingTitles] = useState(true);
  const [showGrantPanel, setShowGrantPanel] = useState(false);
  const [awardableTitles, setAwardableTitles] = useState<AwardableTitle[]>([]);
  const [loadingAwardable, setLoadingAwardable] = useState(false);
  const [selectedTtlId, setSelectedTtlId] = useState<string>("");
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadTitles = useCallback(async () => {
    setLoadingTitles(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("mem_ttl_rel")
      .select(
        "mem_ttl_id, grnt_at, grnt_by_mem_id, ttl_mst!inner(ttl_nm)",
      )
      .eq("team_mem_id", member.team_mem_id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("grnt_at", { ascending: false });

    type TtlMst = { ttl_nm: string };
    setTitles(
      (data ?? []).map((r) => ({
        mem_ttl_id: r.mem_ttl_id,
        ttl_nm: (r.ttl_mst as unknown as TtlMst).ttl_nm,
        grnt_at: r.grnt_at,
        grnt_by_mem_id: r.grnt_by_mem_id,
      })),
    );
    setLoadingTitles(false);
  }, [member.team_mem_id]);

  const loadAwardableTitles = useCallback(async () => {
    setLoadingAwardable(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("ttl_mst")
      .select("ttl_id, ttl_nm")
      .eq("team_id", teamId)
      .eq("ttl_kind_enm", "awarded")
      .eq("use_yn", true)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("sort_ord", { ascending: true });

    setAwardableTitles(data ?? []);
    setLoadingAwardable(false);
  }, [teamId]);

  useEffect(() => {
    loadTitles();
  }, [loadTitles]);

  const handleOpenGrantPanel = () => {
    setShowGrantPanel(true);
    setSelectedTtlId("");
    loadAwardableTitles();
  };

  const handleGrant = async () => {
    if (!selectedTtlId) return;
    setGranting(true);
    const result = await grantTitle(member.team_mem_id, selectedTtlId, teamId);
    if (result.ok) {
      setShowGrantPanel(false);
      await loadTitles();
    } else {
      alert(result.message);
    }
    setGranting(false);
  };

  const handleRevoke = async (memTtlId: string, ttlNm: string) => {
    if (!confirm(`"${ttlNm}" 칭호를 회수하시겠습니까?`)) return;
    setRevoking(memTtlId);
    const result = await revokeTitle(memTtlId);
    if (result.ok) {
      setTitles((prev) => prev.filter((t) => t.mem_ttl_id !== memTtlId));
    } else {
      alert(result.message);
    }
    setRevoking(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between">
        <SectionLabel>보유 칭호</SectionLabel>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-primary"
          onClick={handleOpenGrantPanel}
        >
          수여
        </Button>
      </div>

      {/* 수여 패널 */}
      {showGrantPanel && (
        <GrantPanel
          awardableTitles={awardableTitles}
          loadingAwardable={loadingAwardable}
          selectedTtlId={selectedTtlId}
          onSelect={setSelectedTtlId}
          granting={granting}
          onGrant={handleGrant}
          onCancel={() => setShowGrantPanel(false)}
        />
      )}

      {/* 칭호 목록 — 배지 형태로 가로 나열 */}
      {loadingTitles ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
      ) : titles.length === 0 ? (
        <EmptyState variant="inline" message="보유 칭호 없음" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {titles.map((t) => (
            <div
              key={t.mem_ttl_id}
              className="flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1"
            >
              <span className="text-[12px] font-medium text-foreground">{t.ttl_nm}</span>
              <button
                onClick={() => handleRevoke(t.mem_ttl_id, t.ttl_nm)}
                disabled={revoking === t.mem_ttl_id}
                className="ml-0.5 rounded-full text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                aria-label={`"${t.ttl_nm}" 회수`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

export function AdminMembersClient({ teamId, initialTeamMemId }: { teamId: string; initialTeamMemId?: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [actioning, setActioning] = useState(false);

  const loadMembers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("team_mem_rel")
      .select(
        "team_mem_id, mem_id, team_role_cd, mem_st_cd, join_dt, mem_mst!inner(mem_nm, phone_no, email_addr, gdr_enm, birth_dt, avatar_url)",
      )
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_mst.vers", 0)
      .eq("mem_mst.del_yn", false)
      .order("join_dt", { ascending: false });

    type Mst = {
      mem_nm: string;
      phone_no: string | null;
      email_addr: string | null;
      gdr_enm: string | null;
      birth_dt: string | null;
      avatar_url: string | null;
    };
    setMembers(
      (data ?? []).map((r) => {
        const m = r.mem_mst as unknown as Mst;
        return {
          id: r.mem_id,
          team_mem_id: r.team_mem_id,
          full_name: m.mem_nm,
          phone: m.phone_no,
          email: m.email_addr,
          gender: m.gdr_enm,
          birthday: m.birth_dt,
          avatar_url: m.avatar_url,
          status: r.mem_st_cd,
          admin:
            r.team_role_cd === "admin" || r.team_role_cd === "owner",
          joined_at: r.join_dt,
        };
      }),
    );
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // initialTeamMemId가 있으면 최초 1회만 자동 선택
  const initialSelectDone = useRef(false);
  useEffect(() => {
    if (!initialTeamMemId || loading || initialSelectDone.current) return;
    const found = members.find((m) => m.team_mem_id === initialTeamMemId);
    if (found) {
      setSelectedMember(found);
      initialSelectDone.current = true;
    }
  }, [initialTeamMemId, loading, members]);

  const filtered = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.full_name?.toLowerCase().includes(q) || m.phone?.includes(q);
  });

  const handleDeleteMember = async (memberId: string, name: string) => {
    if (!confirm(`${name} 회원을 삭제하시겠습니까?`)) return;
    setActioning(true);
    const result = await deleteMember(memberId);
    if (result.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setSelectedMember(null);
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

      {/* 회원 수 */}
      <Caption>{filtered.length}명</Caption>

      {/* 회원 목록 */}
      <div className="flex flex-col gap-2">
        {filtered.map((member) => (
          <CardItem asChild key={member.id} className="flex items-center gap-3">
            <button
              onClick={() => setSelectedMember(member)}
              className="text-left transition-colors active:bg-secondary"
            >
              <Avatar src={member.avatar_url} size="md" />
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <Body className="font-semibold">
                    {member.full_name ?? "이름 없음"}
                  </Body>
                  {member.admin && (
                    <Shield className="size-3.5 text-primary" />
                  )}
                </div>
                <Caption>{member.phone ?? "연락처 없음"}</Caption>
                <Caption className="text-muted-foreground/60">
                  {member.joined_at
                    ? dayjs(member.joined_at).format("YYYY.MM.DD 가입")
                    : "가입일 없음"}
                </Caption>
              </div>
              <ChevronRight className="size-4 shrink-0 text-border" />
            </button>
          </CardItem>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <UserRound className="size-12 text-muted-foreground/30" />
          <Body className="text-muted-foreground">검색 결과가 없습니다</Body>
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
          <div className="flex max-h-[80vh] flex-col overflow-y-auto rounded-t-3xl bg-background pb-8">
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
                      ? dayjs(selectedMember.joined_at).format("YYYY.MM.DD")
                      : null
                  }
                />
              </div>

              {/* 칭호 관리 */}
              <TitleSection member={selectedMember} teamId={teamId} />

              {/* 액션 버튼 */}
              <div className="flex flex-col gap-2">
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
                <Button
                  variant="outline"
                  onClick={() =>
                    handleDeleteMember(
                      selectedMember.id,
                      selectedMember.full_name ?? "이름 없음",
                    )
                  }
                  disabled={actioning}
                  className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                >
                  <UserX className="size-4 text-destructive" />
                  <span className="text-[15px] font-medium text-destructive">
                    회원 삭제
                  </span>
                </Button>
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
      <Caption>{label}</Caption>
      <Body className="font-medium">{value ?? "-"}</Body>
    </div>
  );
}
