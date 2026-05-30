"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { Plus, RefreshCw, Save } from "lucide-react";

import { formatKSTDateTime } from "@/lib/dayjs";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";
import { cmmCdRowsForGrp } from "@/lib/queries/cmm-cd-cached";
import { createClient } from "@/lib/supabase/client";

import { createTitle, grantTitle, revokeTitle, toggleTitleUseYn, updateTitle } from "@/app/actions/admin/manage-title";
import { sweepAllTitles } from "@/app/actions/admin/sweep-titles";

import { EmptyState } from "@/components/common/empty-state";
import { H2, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type GrantRow = {
  mem_ttl_id: string;
  team_mem_id: string;
  grnt_at: string;
  grnt_by_mem_id: string | null;
  grnt_rsn_txt: string | null;
  is_prmy_yn: boolean;
  del_yn: boolean;
  team_mem_rel: {
    mem_mst: {
      mem_nm: string;
    };
  };
};

type TitleRow = {
  ttl_id: string;
  ttl_nm: string;
  ttl_kind_enm: "auto" | "awarded";
  ttl_ctgr_cd: string;
  ttl_desc: string | null;
  sort_ord: number;
  use_yn: boolean;
  cond_rule_json: unknown | null;
  rarity_level: number;
  ttl_group_cd: number | null;
  prmy_cnt: number;
};

type SortKey = "ttl_kind_enm" | "ttl_ctgr_cd" | "rarity_level" | "ttl_group_cd" | "event" | "prmy_cnt";
type SortDir = "asc" | "desc";

type TitleForm = {
  ttlNm: string;
  ttlKindEnm: "auto" | "awarded";
  ttlCtgrCd: string;
  ttlDesc: string;
  sortOrd: string;
  useYn: "true" | "false";
  condRuleJson: string;
  rarityLevel: string;
  ttlGroupCd: string;
};

const TITLE_KIND_OPTIONS: { value: "auto" | "awarded"; label: string }[] = [
  { value: "auto", label: "자동" },
  { value: "awarded", label: "수여" },
];

const RARITY_LEVEL_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}등급`,
}));

function toForm(row: TitleRow): TitleForm {
  return {
    ttlNm: row.ttl_nm ?? "",
    ttlKindEnm: row.ttl_kind_enm,
    ttlCtgrCd: row.ttl_ctgr_cd ?? "",
    ttlDesc: row.ttl_desc ?? "",
    sortOrd: String(row.sort_ord ?? 100),
    useYn: row.use_yn ? "true" : "false",
    condRuleJson: row.cond_rule_json ? JSON.stringify(row.cond_rule_json) : "",
    rarityLevel: String(row.rarity_level ?? 1),
    ttlGroupCd: row.ttl_group_cd !== null ? String(row.ttl_group_cd) : "",
  };
}

function buildEmptyForm(defaultCategory: string): TitleForm {
  return {
    ttlNm: "",
    ttlKindEnm: "auto",
    ttlCtgrCd: defaultCategory,
    ttlDesc: "",
    sortOrd: "100",
    useYn: "true",
    condRuleJson: "",
    rarityLevel: "1",
    ttlGroupCd: "",
  };
}

export function AdminTitlesClient({
  teamId,
  cmmCdRows,
}: {
  teamId: string;
  cmmCdRows: CachedCmmCdRow[];
}) {
  const categoryOptions = useMemo(
    () => cmmCdRowsForGrp(cmmCdRows, "TTL_CTGR_CD"),
    [cmmCdRows],
  );
  const defaultCategory = categoryOptions[0]?.cd ?? "awarded";

  const [rows, setRows] = useState<TitleRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [forms, setForms] = useState<Record<string, TitleForm>>({});
  const [newForm, setNewForm] = useState<TitleForm>(() =>
    buildEmptyForm(defaultCategory),
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadTitles = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("ttl_mst")
      .select(
        "ttl_id, ttl_nm, ttl_kind_enm, ttl_ctgr_cd, ttl_desc, sort_ord, use_yn, cond_rule_json, rarity_level, ttl_group_cd, mem_ttl_rel(ttl_id)",
      )
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_ttl_rel.is_prmy_yn", true)
      .eq("mem_ttl_rel.del_yn", false)
      .order("sort_ord", { ascending: true })
      .order("rarity_level", { ascending: true });

    const nextRows = ((data ?? []) as unknown as (Omit<TitleRow, "prmy_cnt"> & { mem_ttl_rel: { ttl_id: string }[] })[]).map(
      (row) => ({ ...row, prmy_cnt: row.mem_ttl_rel?.length ?? 0 }),
    ) as TitleRow[];
    setRows(nextRows);
    setForms(
      Object.fromEntries(nextRows.map((row) => [row.ttl_id, toForm(row)])),
    );
    setSelectedId((prev) => {
      if (nextRows.length === 0) return "";
      if (prev && nextRows.some((row) => row.ttl_id === prev)) return prev;
      return nextRows[0].ttl_id;
    });
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    void loadTitles();
  }, [loadTitles]);

  const updateFormField = (
    ttlId: string,
    key: keyof TitleForm,
    value: string,
  ) => {
    setForms((prev) => ({
      ...prev,
      [ttlId]: {
        ...prev[ttlId],
        [key]: value,
      },
    }));
  };

  const validateForm = (form: TitleForm): string | null => {
    if (!form.ttlNm.trim()) return "칭호명은 필수입니다.";
    if (!form.ttlKindEnm) return "칭호 유형은 필수입니다.";
    if (!form.ttlCtgrCd) return "카테고리는 필수입니다.";
    if (!form.sortOrd.trim()) return "정렬 순서는 필수입니다.";
    if (!form.useYn) return "사용 여부는 필수입니다.";
    if (form.ttlKindEnm === "auto" && !form.condRuleJson.trim()) return "자동 유형은 자동 조건(JSON)이 필수입니다.";
    return null;
  };

  const saveRow = async (ttlId: string) => {
    const form = forms[ttlId];
    if (!form) return;
    const validationError = validateForm(form);
    if (validationError) { alert(validationError); return; }
    setSavingId(ttlId);
    const result = await updateTitle(ttlId, form);
    if (!result.ok) {
      alert(result.message ?? "칭호 수정에 실패했습니다.");
      setSavingId(null);
      return;
    }
    await loadTitles();
    setSavingId(null);
  };

  const toggleUseYn = async (ttlId: string, currentUseYn: boolean) => {
    setTogglingId(ttlId);
    const result = await toggleTitleUseYn(ttlId, !currentUseYn);
    if (result.ok) {
      setRows((prev) =>
        prev.map((r) => r.ttl_id === ttlId ? { ...r, use_yn: !currentUseYn } : r)
      );
      setForms((prev) => ({
        ...prev,
        [ttlId]: { ...prev[ttlId], useYn: (!currentUseYn ? "true" : "false") },
      }));
    } else {
      alert(result.message ?? "저장에 실패했습니다");
    }
    setTogglingId(null);
  };

  const createRow = async () => {
    const validationError = validateForm(newForm);
    if (validationError) { alert(validationError); return; }
    setCreating(true);
    const result = await createTitle(newForm);
    if (!result.ok) {
      alert(result.message ?? "칭호 등록에 실패했습니다.");
      setCreating(false);
      return;
    }
    setNewForm(buildEmptyForm(defaultCategory));
    setShowCreateForm(false);
    await loadTitles();
    setCreating(false);
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let av: string | number | boolean;
      let bv: string | number | boolean;
      if (sortKey === "event") {
        av = a.ttl_ctgr_cd === "event" ? 1 : 0;
        bv = b.ttl_ctgr_cd === "event" ? 1 : 0;
      } else if (sortKey === "prmy_cnt") {
        av = a.prmy_cnt;
        bv = b.prmy_cnt;
      } else if (sortKey === "ttl_group_cd") {
        av = a.ttl_group_cd ?? -1;
        bv = b.ttl_group_cd ?? -1;
      } else {
        av = a[sortKey] ?? "";
        bv = b[sortKey] ?? "";
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="ml-0.5 text-muted-foreground/40">↕</span>;
    return <span className="ml-0.5 text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const selectedRow = rows.find((row) => row.ttl_id === selectedId) ?? null;
  const selectedForm = selectedRow ? forms[selectedRow.ttl_id] ?? toForm(selectedRow) : null;

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <H2>칭호 관리</H2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (!confirm("전체 활성 멤버를 대상으로 자동 칭호를 재평가합니다. 계속할까요?")) return;
              setSweeping(true);
              const result = await sweepAllTitles();
              setSweeping(false);
              alert(result.message ?? (result.ok ? "완료" : "실패"));
            }}
            disabled={sweeping}
            className="h-8 rounded-lg"
          >
            <RefreshCw className={`size-4 ${sweeping ? "animate-spin" : ""}`} />
            {sweeping ? "재계산 중..." : "일괄 재계산"}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setShowCreateForm((prev) => !prev);
              setNewForm(buildEmptyForm(defaultCategory));
            }}
            className="h-8 rounded-lg"
          >
            <Plus className="size-4" />
            신규
          </Button>
        </div>
      </div>

      {showCreateForm && (
        <CardItem className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-foreground">신규 칭호 등록</p>
          <TitleFormFields
            form={newForm}
            categoryOptions={categoryOptions}
            onChange={(key, value) =>
              setNewForm((prev) => ({ ...prev, [key]: value }))
            }
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCreateForm(false)}
              className="h-10 rounded-lg"
            >
              취소
            </Button>
            <Button
              onClick={createRow}
              disabled={creating}
              className="h-10 rounded-lg"
            >
              <Plus className="size-4" />
              {creating ? "등록 중..." : "등록"}
            </Button>
          </div>
        </CardItem>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : (
        <CardItem className="p-0">
          <div className="max-h-60 overflow-y-auto overflow-x-auto">
            <table className="w-full border-collapse text-[11px] [font-variant-numeric:tabular-nums]">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">칭호명</th>
                  <th
                    className="w-10 cursor-pointer select-none px-2 py-1.5 text-center font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort("ttl_kind_enm")}
                  >유형<SortIcon k="ttl_kind_enm" /></th>
                  <th
                    className="w-16 cursor-pointer select-none px-2 py-1.5 text-center font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort("ttl_ctgr_cd")}
                  >카테고리<SortIcon k="ttl_ctgr_cd" /></th>
                  <th className="w-8 px-2 py-1.5 text-center font-medium text-muted-foreground">정렬</th>
                  <th className="w-14 px-2 py-1.5 text-center font-medium text-muted-foreground">사용</th>
                  <th
                    className="w-12 cursor-pointer select-none px-2 py-1.5 text-center font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort("rarity_level")}
                  >희귀도<SortIcon k="rarity_level" /></th>
                  <th
                    className="w-8 cursor-pointer select-none px-2 py-1.5 text-center font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort("ttl_group_cd")}
                  >그룹<SortIcon k="ttl_group_cd" /></th>
                  <th
                    className="w-12 cursor-pointer select-none px-2 py-1.5 text-center font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort("event")}
                  >이벤트<SortIcon k="event" /></th>
                  <th
                    className="w-10 cursor-pointer select-none px-2 py-1.5 text-center font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort("prmy_cnt")}
                  >대표<SortIcon k="prmy_cnt" /></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-2 py-6 text-center text-xs text-muted-foreground"
                    >
                      등록된 칭호가 없습니다.
                    </td>
                  </tr>
                ) : sortedRows.map((row) => {
                  const active = row.ttl_id === selectedId;
                  return (
                    <tr
                      key={row.ttl_id}
                      onClick={() => setSelectedId(row.ttl_id)}
                      className={`cursor-pointer border-b transition-colors hover:bg-muted/30 ${
                        active ? "bg-primary/5" : ""
                      } ${!row.use_yn ? "opacity-40" : ""}`}
                    >
                      <td className="truncate px-2 py-1.5 text-center font-medium text-foreground">{row.ttl_nm}</td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{row.ttl_kind_enm === "auto" ? "자동" : "수여"}</td>
                      <td className="truncate px-2 py-1.5 text-center text-muted-foreground">{categoryOptions.find((c) => c.cd === row.ttl_ctgr_cd)?.cd_nm ?? row.ttl_ctgr_cd}</td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{row.sort_ord}</td>
                      <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => void toggleUseYn(row.ttl_id, row.use_yn)}
                          disabled={togglingId === row.ttl_id}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                            row.use_yn
                              ? "bg-success/10 text-success hover:bg-success/20"
                              : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                          }`}
                        >
                          {togglingId === row.ttl_id ? "..." : row.use_yn ? "사용" : "잠금"}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{row.rarity_level ?? 1}</td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{row.ttl_group_cd ?? "-"}</td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{row.ttl_ctgr_cd === "event" ? "✓" : ""}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">
                        {row.prmy_cnt > 0 ? <span className="font-medium text-foreground">{row.prmy_cnt}</span> : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardItem>
      )}

      {selectedRow && selectedForm && (
        <CardItem className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              선택 칭호 수정: {selectedRow.ttl_nm}
            </p>
            <Button
              size="sm"
              onClick={() => saveRow(selectedRow.ttl_id)}
              disabled={savingId === selectedRow.ttl_id}
              className="h-8 rounded-lg"
            >
              <Save className="size-3.5" />
              {savingId === selectedRow.ttl_id ? "저장 중..." : "저장"}
            </Button>
          </div>
          <TitleFormFields
            form={selectedForm}
            categoryOptions={categoryOptions}
            onChange={(key, value) =>
              updateFormField(selectedRow.ttl_id, key, value)
            }
          />
        </CardItem>
      )}

      {selectedRow && (
        <TitleGrantList
          ttlId={selectedRow.ttl_id}
          teamId={teamId}
          isAwarded={selectedRow.ttl_kind_enm === "awarded"}
        />
      )}
    </div>
  );
}

type MemberSearchRow = {
  team_mem_id: string;
  mem_mst: { mem_nm: string };
};

function TitleGrantList({
  ttlId,
  teamId,
  isAwarded,
}: {
  ttlId: string;
  teamId: string;
  isAwarded: boolean;
}) {
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 수여 패널 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemberSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberSearchRow | null>(null);
  const [grantRsn, setGrantRsn] = useState("");
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadGrants = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("mem_ttl_rel")
      .select(`
        mem_ttl_id,
        team_mem_id,
        grnt_at,
        grnt_by_mem_id,
        grnt_rsn_txt,
        is_prmy_yn,
        del_yn,
        team_mem_rel!inner(
          mem_mst!inner(mem_nm)
        )
      `)
      .eq("ttl_id", ttlId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("grnt_at", { ascending: false });
    if (error) console.error("수여 내역 조회 실패:", error);
    setGrants((data ?? []) as unknown as GrantRow[]);
    setLoading(false);
  }, [ttlId]);

  useEffect(() => {
    void loadGrants();
    // 칭호 바뀌면 검색 초기화
    setSearchQuery("");
    setSearchResults([]);
    setSelectedMember(null);
    setGrantRsn("");
  }, [loadGrants]);

  const searchMembers = async (q: string) => {
    setSearchQuery(q);
    setSelectedMember(null);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("team_mem_rel")
      .select("team_mem_id, mem_mst!inner(mem_nm)")
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .ilike("mem_mst.mem_nm", `%${q.trim()}%`)
      .limit(10);
    setSearchResults((data ?? []) as unknown as MemberSearchRow[]);
    setSearching(false);
  };

  const handleGrant = async () => {
    if (!selectedMember) return;
    setGranting(true);
    const result = await grantTitle(ttlId, selectedMember.team_mem_id, grantRsn || null);
    if (!result.ok) {
      alert(result.message ?? "수여에 실패했습니다");
    } else {
      setSearchQuery("");
      setSearchResults([]);
      setSelectedMember(null);
      setGrantRsn("");
      await loadGrants();
    }
    setGranting(false);
  };

  const handleRevoke = async (memTtlId: string) => {
    if (!confirm("이 멤버의 칭호를 회수하시겠습니까?")) return;
    setRevokingId(memTtlId);
    const result = await revokeTitle(memTtlId);
    if (!result.ok) alert(result.message ?? "회수에 실패했습니다");
    else await loadGrants();
    setRevokingId(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SectionLabel>획득 내역</SectionLabel>
        {!loading && (
          <span className="text-[11px] text-muted-foreground">{grants.length}명</span>
        )}
      </div>

      {/* 수여 칭호일 때만 수여 패널 노출 */}
      {isAwarded && (
        <CardItem className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-foreground">멤버 수여</p>
          <div className="relative">
            <Input
              placeholder="멤버 이름 검색"
              value={searchQuery}
              onChange={(e) => void searchMembers(e.target.value)}
              className="h-9 rounded-lg text-sm"
            />
            {searchResults.length > 0 && !selectedMember && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                {searchResults.map((m) => (
                  <button
                    key={m.team_mem_id}
                    onClick={() => {
                      setSelectedMember(m);
                      setSearchQuery(m.mem_mst.mem_nm);
                      setSearchResults([]);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {m.mem_mst.mem_nm}
                  </button>
                ))}
              </div>
            )}
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">검색 중...</span>
            )}
          </div>
          {selectedMember && (
            <div className="flex flex-col gap-2">
              <Input
                placeholder="수여 사유 (선택)"
                value={grantRsn}
                onChange={(e) => setGrantRsn(e.target.value)}
                className="h-9 rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg"
                  onClick={() => { setSelectedMember(null); setSearchQuery(""); setGrantRsn(""); }}
                >
                  취소
                </Button>
                <Button
                  size="sm"
                  className="h-8 rounded-lg"
                  onClick={() => void handleGrant()}
                  disabled={granting}
                >
                  {granting ? "수여 중..." : `${selectedMember.mem_mst.mem_nm}에게 수여`}
                </Button>
              </div>
            </div>
          )}
        </CardItem>
      )}

      {loading ? (
        <CardItem className="flex flex-col gap-2 p-3">
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </CardItem>
      ) : grants.length === 0 ? (
        <EmptyState message="수여 내역이 없습니다." />
      ) : (
        <CardItem className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px] [font-variant-numeric:tabular-nums]">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">멤버명</th>
                  <th className="w-24 px-2 py-1.5 text-center font-medium text-muted-foreground">수여일</th>
                  <th className="w-12 px-2 py-1.5 text-center font-medium text-muted-foreground">방식</th>
                  <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">사유</th>
                  {isAwarded && (
                    <th className="w-12 px-2 py-1.5 text-center font-medium text-muted-foreground">회수</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {grants.map((grant) => (
                  <tr key={grant.mem_ttl_id} className="border-b last:border-0">
                    <td className="px-2 py-1.5 text-center font-medium text-foreground">
                      <Link
                        href={`/admin/members?member=${grant.team_mem_id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {grant.team_mem_rel.mem_mst.mem_nm}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">
                      {formatKSTDateTime(grant.grnt_at).slice(0, 10)}
                    </td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">
                      {grant.grnt_by_mem_id === null ? "자동" : "수동"}
                    </td>
                    <td className="max-w-[120px] truncate px-2 py-1.5 text-center text-muted-foreground">
                      {grant.grnt_rsn_txt ?? "-"}
                    </td>
                    {isAwarded && (
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => void handleRevoke(grant.mem_ttl_id)}
                          disabled={revokingId === grant.mem_ttl_id}
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          {revokingId === grant.mem_ttl_id ? "..." : "회수"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardItem>
      )}
    </div>
  );
}

function TitleFormFields({
  form,
  categoryOptions,
  onChange,
}: {
  form: TitleForm;
  categoryOptions: { cd: string; cd_nm: string }[];
  onChange: (key: keyof TitleForm, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* 행 1: 카테고리 / 사용여부 */}
      <LabeledSelect
        label="카테고리"
        value={form.ttlCtgrCd}
        onChange={(v) => onChange("ttlCtgrCd", v)}
        required
        items={categoryOptions.map((item) => ({
          value: item.cd,
          label: item.cd_nm,
        }))}
      />
      <LabeledSelect
        label="사용 여부"
        value={form.useYn}
        onChange={(v) => onChange("useYn", v)}
        required
        items={[
          { value: "true", label: "사용" },
          { value: "false", label: "미사용" },
        ]}
      />

      {/* 행 2: 칭호유형 (단독) */}
      <LabeledSelect
        label="칭호 유형"
        value={form.ttlKindEnm}
        onChange={(v) => onChange("ttlKindEnm", v)}
        required
        items={TITLE_KIND_OPTIONS.map((item) => ({
          value: item.value,
          label: item.label,
        }))}
      />
      <div />

      {/* 행 3: 칭호명 / 정렬순서 */}
      <LabeledInput
        label="칭호명"
        value={form.ttlNm}
        onChange={(v) => onChange("ttlNm", v)}
        required
      />
      <LabeledInput
        label="정렬 순서"
        type="number"
        value={form.sortOrd}
        onChange={(v) => onChange("sortOrd", v)}
        required
      />

      {/* 행 5: 자동조건(JSON) — auto일 때만 필수, 한 줄 전체 */}
      {form.ttlKindEnm === "auto" && (
        <div className="col-span-2">
          <LabeledInput
            label="자동 조건(JSON)"
            value={form.condRuleJson}
            onChange={(v) => onChange("condRuleJson", v)}
            required
            placeholder='예: {"type":"race_pb_under_sec","sport":"FULL","sec":10800}'
          />
        </div>
      )}

      {/* 행 6: 희귀도 등급 / 그룹 코드 */}
      <LabeledSelect
        label="희귀도 등급 (1~10)"
        value={form.rarityLevel}
        onChange={(v) => onChange("rarityLevel", v)}
        required
        items={RARITY_LEVEL_OPTIONS}
      />
      {/* 그룹 코드 */}
      <LabeledInput
        label="그룹 코드"
        type="number"
        value={form.ttlGroupCd}
        onChange={(v) => onChange("ttlGroupCd", v)}
        placeholder="예: 1, 2, 10 (없으면 독립 선택)"
      />

      {/* 행 7: 설명 (full-width) */}
      <div className="col-span-2">
        <LabeledInput
          label="설명"
          value={form.ttlDesc}
          onChange={(v) => onChange("ttlDesc", v)}
        />
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-lg"
      />
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  items,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
