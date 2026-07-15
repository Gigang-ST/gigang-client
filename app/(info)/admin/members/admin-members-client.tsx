"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";

import {
  Search,
  Shield,
  ShieldOff,
  UserX,
  UserMinus,
  UserCheck,
  X,
} from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import { createClient } from "@/lib/supabase/client";
import {
  PACE_LABELS,
  JOIN_SRC_LABELS,
  JOIN_PURP_SHORT_LABELS,
} from "@/lib/validations/member";

import { grantTitle } from "@/app/actions/admin/grant-title";
import {
  toggleAdmin,
  deleteMember,
  reactivateMember,
  batchDeactivateMembers,
  batchReactivateMembers,
} from "@/app/actions/admin/manage-member";
import { revokeTitle } from "@/app/actions/admin/revoke-title";

import { ParticipationSection } from "./participation-section";
import { ParticipationTab } from "./participation-tab";

import { Avatar } from "@/components/common/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { InfoRow } from "@/components/common/info-row";
import { SegmentControl } from "@/components/common/segment-control";
import { H2, Caption, SectionLabel } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


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
  inact_rsn_txt: string | null;
  bal_amt: number | null;
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
// 상태 배지
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string | null }) {
  if (status === "active") return <Badge variant="default" className="text-[10px] px-1.5 py-0">활성</Badge>;
  if (status === "inactive") return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">비활성</Badge>;
  if (status === "left") return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">탈퇴</Badge>;
  if (status === "pending") return <Badge variant="outline" className="text-[10px] px-1.5 py-0">대기</Badge>;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status ?? "-"}</Badge>;
}

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
// 온보딩(러닝 프로필) 섹션 — 가입 시점 스냅샷을 컴팩트하게 표시
// ---------------------------------------------------------------------------

type OnboardingProfile = {
  near_stn_nm: string | null;
  avg_run_dist_km: number | null;
  avg_pace_cd: string | null;
  join_purp_cds: string[] | null;
  join_purp_txt: string | null;
  join_src_cd: string | null;
  join_src_txt: string | null;
};

/** 라벨-값 미니 pill (역·거리·페이스처럼 짧은 항목 한 줄 나열용) */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium text-foreground">{value}</span>
    </span>
  );
}

function OnboardingSection({ memId }: { memId: string }) {
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // memId별 remount(호출부 key)라 loading 초기값(true)이 그대로 적용된다 —
    // effect 안에서 동기 setState를 부르지 않는다.
    let alive = true;
    const supabase = createClient();
    // RLS mem_onbd_prf_select_team_admin 이 팀 관리자에게 팀원 온보딩 조회를 허용한다.
    supabase
      .from("mem_onbd_prf")
      .select(
        "near_stn_nm, avg_run_dist_km, avg_pace_cd, join_purp_cds, join_purp_txt, join_src_cd, join_src_txt",
      )
      .eq("mem_id", memId)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (!alive) return;
          setProfile((data as OnboardingProfile) ?? null);
          setLoading(false);
        },
        // 네트워크 실패 등으로 reject 되면 스켈레톤이 영영 안 걷히므로 로딩만 해제
        () => {
          if (!alive) return;
          setLoading(false);
        },
      );
    return () => {
      alive = false;
    };
  }, [memId]);

  const paceLabel = profile?.avg_pace_cd
    ? (PACE_LABELS[profile.avg_pace_cd as keyof typeof PACE_LABELS] ??
      profile.avg_pace_cd)
    : null;
  const srcLabel = profile?.join_src_cd
    ? profile.join_src_cd === "ETC" && profile.join_src_txt
      ? profile.join_src_txt
      : (JOIN_SRC_LABELS[profile.join_src_cd as keyof typeof JOIN_SRC_LABELS] ??
        profile.join_src_cd)
    : null;
  const purpLabels = (profile?.join_purp_cds ?? []).map(
    (c) => JOIN_PURP_SHORT_LABELS[c as keyof typeof JOIN_PURP_SHORT_LABELS] ?? c,
  );

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>러닝 프로필</SectionLabel>
      {loading ? (
        <Skeleton className="h-20 w-full rounded-2xl" />
      ) : !profile ? (
        <EmptyState variant="inline" message="온보딩 정보 없음" />
      ) : (
        <CardItem className="flex flex-col gap-2.5 p-3.5">
          {/* 역 · 거리 · 페이스 — 한 줄 미니 스탯 */}
          <div className="flex flex-wrap gap-1.5">
            <MiniStat label="역" value={profile.near_stn_nm || "-"} />
            <MiniStat
              label="거리"
              value={
                profile.avg_run_dist_km != null
                  ? `${profile.avg_run_dist_km}km`
                  : "-"
              }
            />
            <MiniStat label="페이스" value={paceLabel ?? "-"} />
          </div>

          {/* 유입 경로 */}
          {srcLabel && (
            <div className="flex items-center gap-1.5">
              <Caption className="text-[11px]">유입</Caption>
              <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                {srcLabel}
              </Badge>
            </div>
          )}

          {/* 가입 목적 */}
          {purpLabels.length > 0 && (
            <div className="flex items-start gap-1.5">
              <Caption className="text-[11px] shrink-0 pt-0.5">목적</Caption>
              <div className="flex flex-wrap gap-1">
                {purpLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-foreground"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 자유 한마디 */}
          {profile.join_purp_txt && (
            <p className="rounded-lg bg-secondary/50 px-2.5 py-1.5 text-[12px] leading-snug text-muted-foreground">
              &ldquo;{profile.join_purp_txt}&rdquo;
            </p>
          )}
        </CardItem>
      )}
    </div>
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
    // 마운트 시 칭호 fetch — 외부(네트워크) 동기화 effect라 set-state-in-effect는 오탐
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const [tab, setTab] = useState<"members" | "participation">("members");
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [actioning, setActioning] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deactivateTarget, setDeactivateTarget] = useState<{ ids: string[] } | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");

  const loadMembers = useCallback(async () => {
    const supabase = createClient();
    try {
      const [{ data: membersData }, { data: snapsData }] = await Promise.all([
        supabase
          .from("team_mem_rel")
          .select(
            "team_mem_id, mem_id, team_role_cd, mem_st_cd, join_dt, inact_rsn_txt, mem_mst!inner(mem_nm, phone_no, email_addr, gdr_enm, birth_dt, avatar_url)",
          )
          .eq("team_id", teamId)
          .eq("vers", 0)
          .eq("del_yn", false)
          .eq("mem_mst.vers", 0)
          .eq("mem_mst.del_yn", false)
          .order("join_dt", { ascending: false }),
        supabase
          .from("fee_mem_bal_snap")
          .select("mem_id, bal_amt")
          .eq("team_id", teamId)
          .eq("vers", 0)
          .eq("del_yn", false),
      ]);

      const snapMap = new Map((snapsData ?? []).map((s) => [s.mem_id, s.bal_amt]));

      type Mst = {
        mem_nm: string;
        phone_no: string | null;
        email_addr: string | null;
        gdr_enm: string | null;
        birth_dt: string | null;
        avatar_url: string | null;
      };

      setMembers(
        (membersData ?? []).map((r) => {
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
            admin: r.team_role_cd === "admin" || r.team_role_cd === "owner",
            joined_at: r.join_dt,
            inact_rsn_txt: r.inact_rsn_txt ?? null,
            bal_amt: snapMap.get(r.mem_id) ?? null,
          };
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const initialSelectDone = useRef(false);
  useEffect(() => {
    if (!initialTeamMemId || loading || initialSelectDone.current) return;
    const found = members.find((m) => m.team_mem_id === initialTeamMemId);
    if (found) {
      // 딥링크(?memId) 도착 시 목록 로드 완료 후 상세 시트 1회 자동 오픈 — URL 파라미터
      // 동기화 effect라 set-state-in-effect는 오탐
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedMember(found);
      initialSelectDone.current = true;
    }
  }, [initialTeamMemId, loading, members]);

  const filtered = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.full_name?.toLowerCase().includes(q) || m.phone?.includes(q);
  });

  const statusFiltered = filtered.filter((m) => {
    if (statusFilter === "active") return m.status === "active";
    // "비활성" 필터는 inactive/left 모두 포함 — 별도 세그먼트로 안 쪼개면
    // left 회원이 필터에서 아예 안 보여 재활성화 자체가 막힌다.
    if (statusFilter === "inactive") return m.status === "inactive" || m.status === "left";
    return true;
  });

  const activeSelectedIds = [...selectedIds].filter(
    (id) => statusFiltered.find((m) => m.id === id)?.status === "active",
  );
  const reactivatableSelectedIds = [...selectedIds].filter((id) => {
    const status = statusFiltered.find((m) => m.id === id)?.status;
    return status === "inactive" || status === "left";
  });

  const displayedIds = statusFiltered.map((m) => m.id);
  const isAllSelected = displayedIds.length > 0 && displayedIds.every((id) => selectedIds.has(id));
  const isIndeterminate = !isAllSelected && displayedIds.some((id) => selectedIds.has(id));

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      const allSelected = displayedIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) displayedIds.forEach((id) => next.delete(id));
      else displayedIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const handleDeleteMember = async (memberId: string, name: string) => {
    if (!confirm(`${name} 회원을 삭제하시겠습니까?`)) return;
    setActioning(true);
    const result = await deleteMember(memberId);
    if (result.ok) {
      setSelectedMember(null);
      await loadMembers();
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
      await loadMembers();
      setSelectedMember((prev) =>
        prev?.id === memberId ? { ...prev, admin: isAdmin } : prev,
      );
    } else {
      alert(result.message);
    }
    setActioning(false);
  };

  function handleBatchDeactivate(reason: string) {
    const ids = deactivateTarget?.ids ?? [];
    startTransition(async () => {
      const res = await batchDeactivateMembers(ids, reason);
      if (res.ok) {
        setDeactivateTarget(null);
        setDeactivateReason("");
        setSelectedIds(new Set());
        await loadMembers();
      } else {
        alert(res.message);
      }
    });
  }

  function handleBatchReactivate(memberIds: string[]) {
    if (!confirm(`${memberIds.length}명을 활성화하시겠습니까?`)) return;
    startTransition(async () => {
      const res = await batchReactivateMembers(memberIds);
      if (res.ok) {
        setSelectedIds(new Set());
        await loadMembers();
      } else {
        alert(res.message);
      }
    });
  }

  function handleSingleReactivate(memberId: string) {
    if (!confirm("활성화하시겠습니까?")) return;
    // 비활성/탈퇴 기간 회비는 자동으로 빠집니다. 잔액(예치금·미납)은 기본 보존.
    const resetBalance = confirm(
      "잔액을 0으로 초기화할까요?\n\n확인 = 초기화(과거 예치금·미납 청산)\n취소 = 기존 잔액 유지",
    );
    startTransition(async () => {
      const res = await reactivateMember(memberId, resetBalance);
      if (res.ok) {
        setSelectedMember(null);
        await loadMembers();
      } else {
        alert(res.message);
      }
    });
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-6 pt-4">
        <Skeleton className="h-8 w-32 rounded" />
        <Skeleton className="h-12 w-full rounded-xl" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <H2>회원 관리</H2>

      {/* 회원 목록 ↔ 참여 통계 탭 */}
      <SegmentControl
        segments={[
          { value: "members", label: "회원" },
          { value: "participation", label: "참여" },
        ]}
        value={tab}
        onValueChange={(v) => {
          setTab(v as "members" | "participation");
          // 참여 탭에선 배치 액션 바가 안 보이므로, 보이지 않는 선택 상태가 남지 않게 해제
          setSelectedIds(new Set());
        }}
      />

      {tab === "participation" && (
        <ParticipationTab
          members={members}
          onSelectMember={(memId) => {
            const found = members.find((m) => m.id === memId);
            if (found) setSelectedMember(found);
          }}
        />
      )}

      {tab === "members" && (
        <>
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

      {/* 상태 필터 */}
      <SegmentControl
        segments={[
          { value: "all", label: `전체 ${members.length}명` },
          { value: "active", label: `활성 ${members.filter((m) => m.status === "active").length}명` },
          {
            value: "inactive",
            label: `비활성 ${members.filter((m) => m.status === "inactive" || m.status === "left").length}명`,
          },
        ]}
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v as "all" | "active" | "inactive");
          setSelectedIds(new Set());
        }}
      />

      {/* 배치 액션 */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeSelectedIds.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDeactivateTarget({ ids: activeSelectedIds })}
              disabled={isPending}
            >
              <UserMinus className="size-3.5 mr-1" />
              비활성 설정 ({activeSelectedIds.length}명)
            </Button>
          )}
          {reactivatableSelectedIds.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchReactivate(reactivatableSelectedIds)}
              disabled={isPending}
            >
              <UserCheck className="size-3.5 mr-1" />
              활성화 ({reactivatableSelectedIds.length}명)
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            선택 해제
          </Button>
        </div>
      )}

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center">
                <div className="flex justify-center">
                  <Checkbox
                    checked={isIndeterminate ? "indeterminate" : isAllSelected}
                    onCheckedChange={toggleAll}
                  />
                </div>
              </TableHead>
              {["이름", "성별", "생년월일", "가입일자", "연락처", "회원상태", "회비잔액"].map((h) => (
                <TableHead key={h} className="text-center text-xs whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {statusFiltered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center">
                  <Caption className="text-muted-foreground">회원이 없습니다.</Caption>
                </TableCell>
              </TableRow>
            )}
            {statusFiltered.map((member) => {
              const isChecked = selectedIds.has(member.id);
              return (
                <TableRow
                  key={member.id}
                  className={`cursor-pointer ${isChecked ? "bg-muted/40" : ""} ${member.status === "inactive" || member.status === "left" ? "opacity-60" : ""}`}
                  onClick={() => setSelectedMember(member)}
                >
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleMember(member.id)}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Caption className="text-xs font-semibold whitespace-nowrap">{member.full_name ?? "-"}</Caption>
                  </TableCell>
                  <TableCell className="text-center">
                    <Caption className="text-xs whitespace-nowrap">
                      {member.gender === "male" ? "남" : member.gender === "female" ? "여" : "-"}
                    </Caption>
                  </TableCell>
                  <TableCell className="text-center">
                    <Caption className="text-xs whitespace-nowrap">{member.birthday ?? "-"}</Caption>
                  </TableCell>
                  <TableCell className="text-center">
                    <Caption className="text-xs whitespace-nowrap">
                      {member.joined_at ? dayjs(member.joined_at).format("YYYY.MM.DD") : "-"}
                    </Caption>
                  </TableCell>
                  <TableCell className="text-center">
                    <Caption className="text-xs whitespace-nowrap">{member.phone ?? "-"}</Caption>
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={member.status} />
                  </TableCell>
                  <TableCell className="text-center">
                    {member.bal_amt === null ? (
                      <Caption className="text-xs text-muted-foreground">-</Caption>
                    ) : (
                      <Caption
                        className={`text-xs font-semibold whitespace-nowrap ${
                          member.bal_amt < 0 ? "text-destructive" : member.bal_amt > 0 ? "text-primary" : ""
                        }`}
                      >
                        {member.bal_amt > 0 && "+"}{member.bal_amt.toLocaleString()}원
                      </Caption>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
        </>
      )}

      {/* 회원 상세 시트 */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex flex-col">
          <div className="flex-1 bg-black/40" onClick={() => setSelectedMember(null)} />
          <div className="flex max-h-[85vh] flex-col overflow-y-auto rounded-t-3xl bg-background pb-8">
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>
            <div className="flex flex-col gap-6 px-6">
              {/* 헤더 */}
              <div className="flex items-center gap-4">
                <Avatar src={selectedMember.avatar_url} seed={selectedMember.id} size="lg" />
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-bold text-foreground">
                      {selectedMember.full_name ?? "이름 없음"}
                    </span>
                    {selectedMember.admin && (
                      <Badge variant="default" className="text-[11px]">관리자</Badge>
                    )}
                    <StatusBadge status={selectedMember.status} />
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
              <div className="flex flex-col gap-0">
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
                <InfoRow
                  label="회비잔액"
                  value={
                    selectedMember.bal_amt !== null
                      ? `${selectedMember.bal_amt > 0 ? "+" : ""}${selectedMember.bal_amt.toLocaleString()}원`
                      : null
                  }
                />
                {(selectedMember.status === "inactive" || selectedMember.status === "left") && (
                  <InfoRow
                    label={selectedMember.status === "left" ? "탈퇴 사유" : "비활성 사유"}
                    value={selectedMember.inact_rsn_txt || "사유 없음"}
                  />
                )}
              </div>

              {/* 온보딩 러닝 프로필 — 회원별 remount로 이전 회원 값 잔상 방지 */}
              <OnboardingSection key={selectedMember.id} memId={selectedMember.id} />

              {/* 참여 현황 — 모임·대회 참여 요약/월별/최근 활동 */}
              <ParticipationSection
                key={`participation-${selectedMember.id}`}
                memId={selectedMember.id}
                teamId={teamId}
              />

              {/* 칭호 관리 */}
              <TitleSection member={selectedMember} teamId={teamId} />

              {/* 액션 버튼 */}
              <div className="flex flex-col gap-2">
                {selectedMember.admin ? (
                  <Button
                    variant="outline"
                    onClick={() => handleToggleAdmin(selectedMember.id, false)}
                    disabled={actioning || isPending}
                    className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                  >
                    <ShieldOff className="size-4 text-muted-foreground" />
                    <span className="text-[15px] font-medium text-foreground">관리자 해제</span>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => handleToggleAdmin(selectedMember.id, true)}
                    disabled={actioning || isPending}
                    className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                  >
                    <Shield className="size-4 text-primary" />
                    <span className="text-[15px] font-medium text-foreground">관리자 지정</span>
                  </Button>
                )}

                {selectedMember.status === "active" ? (
                  <Button
                    variant="outline"
                    onClick={() => setDeactivateTarget({ ids: [selectedMember.id] })}
                    disabled={actioning || isPending}
                    className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                  >
                    <UserMinus className="size-4 text-muted-foreground" />
                    <span className="text-[15px] font-medium text-foreground">비활성 설정</span>
                  </Button>
                ) : selectedMember.status === "inactive" || selectedMember.status === "left" ? (
                  <Button
                    variant="outline"
                    onClick={() => handleSingleReactivate(selectedMember.id)}
                    disabled={actioning || isPending}
                    className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                  >
                    <UserCheck className="size-4 text-primary" />
                    <span className="text-[15px] font-medium text-foreground">활성화</span>
                  </Button>
                ) : null}

                <Button
                  variant="outline"
                  onClick={() =>
                    handleDeleteMember(
                      selectedMember.id,
                      selectedMember.full_name ?? "이름 없음",
                    )
                  }
                  disabled={actioning || isPending}
                  className="h-auto justify-start gap-3 rounded-xl px-4 py-3.5 text-left"
                >
                  <UserX className="size-4 text-destructive" />
                  <span className="text-[15px] font-medium text-destructive">회원 삭제</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 비활성 설정 다이얼로그 */}
      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeactivateTarget(null);
            setDeactivateReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              비활성 설정 ({deactivateTarget?.ids.length ?? 0}명)
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>비활성화 사유</Label>
              <Input
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                placeholder="예: 장기 미참여, 자진 탈퇴 요청 등"
              />
            </div>
            <Button
              onClick={() => {
                if (deactivateTarget) {
                  handleBatchDeactivate(deactivateReason.trim());
                }
              }}
              disabled={isPending || !deactivateReason.trim()}
              variant="destructive"
            >
              {isPending ? <LoadingSpinner /> : "비활성 설정"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
