"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useQueryState, parseAsStringLiteral, parseAsString } from "nuqs";
import { createClient } from "@/lib/supabase/client";
import { createCompetition } from "@/app/actions/create-competition";
import {
  deleteCompetition,
  updateCompetition,
  deleteRegistration,
} from "@/app/actions/admin/manage-competition";
import {
  Plus,
  Search,
  Calendar,
  MapPin,
  Users,
  Trash2,
  Pencil,
  X,
  Trophy,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { H2 } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CardItem } from "@/components/ui/card";
import { resolveSportConfig, SPORT_LEGEND } from "@/components/races/sport-config";
import type { CompetitionListItem } from "@/lib/queries/admin-data";

type Competition = CompetitionListItem;

type Registration = {
  id: string;
  role: string;
  event_type: string | null;
  member: { full_name: string | null } | null;
};

type Filter = "upcoming" | "past" | "all";
type Mode = "list" | "create" | "edit" | "detail";

const SPORT_OPTIONS = SPORT_LEGEND.filter((s) => s.key !== "other");

const FILTERS: { value: Filter; label: string }[] = [
  { value: "upcoming", label: "다가오는" },
  { value: "past", label: "지난" },
  { value: "all", label: "전체" },
];

const modes = ["list", "create", "edit", "detail"] as const;

export function CompetitionsManager({
  initialCompetitions,
}: {
  initialCompetitions: CompetitionListItem[];
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 px-6 pt-4">
          <Skeleton className="h-8 w-32 rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      }
    >
      <CompetitionsContent initialCompetitions={initialCompetitions} />
    </Suspense>
  );
}

function CompetitionsContent({
  initialCompetitions,
}: {
  initialCompetitions: CompetitionListItem[];
}) {
  const [competitions, setCompetitions] = useState<Competition[]>(initialCompetitions);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useQueryState(
    "mode",
    parseAsStringLiteral(modes).withDefault("list"),
  );
  const [selectedId, setSelectedId] = useQueryState(
    "id",
    parseAsString.withDefault(""),
  );
  const selected = competitions.find((c) => c.id === selectedId) ?? null;
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [regLoading, setRegLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 폼 상태
  const [form, setForm] = useState({
    title: "",
    sport: "road_run",
    startDate: "",
    endDate: "",
    location: "",
    eventTypes: [] as string[],
    sourceUrl: "",
  });

  // 생성/수정/삭제 후 리프레시용
  const loadCompetitions = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("competition")
      .select("*, competition_registration(count)")
      .order("start_date", { ascending: false });

    setCompetitions(
      (data ?? []).map((c: Record<string, unknown>) => ({
        id: c.id as string,
        title: c.title as string,
        sport: c.sport as string | null,
        start_date: c.start_date as string,
        end_date: c.end_date as string | null,
        location: c.location as string | null,
        event_types: c.event_types as string[] | null,
        source_url: c.source_url as string | null,
        registration_count:
          (c.competition_registration as { count: number }[])?.[0]?.count ?? 0,
      })),
    );
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const filtered = competitions
    .filter((c) => {
      if (filter === "upcoming" && c.start_date < today) return false;
      if (filter === "past" && c.start_date >= today) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.title.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) =>
      filter === "upcoming"
        ? a.start_date.localeCompare(b.start_date)
        : b.start_date.localeCompare(a.start_date),
    );

  const loadRegistrations = async (competitionId: string) => {
    setRegLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("competition_registration")
      .select("id, role, event_type, member:member_id(full_name)")
      .eq("competition_id", competitionId);
    setRegistrations((data as unknown as Registration[]) ?? []);
    setRegLoading(false);
  };

  // URL로 직접 접근 시 대회를 찾을 수 없으면 목록으로 복귀
  useEffect(() => {
    if ((mode === "detail" || mode === "edit") && selectedId && !selected && competitions.length > 0) {
      setMode("list");
      setSelectedId("");
    }
  }, [mode, selectedId, selected, competitions.length, setMode, setSelectedId]);

  // URL로 edit 모드 직접 접근 시 폼 데이터 채우기
  useEffect(() => {
    if (mode === "edit" && selected) {
      setForm({
        title: selected.title,
        sport: selected.sport ?? "road_run",
        startDate: selected.start_date,
        endDate: selected.end_date ?? "",
        location: selected.location ?? "",
        eventTypes: selected.event_types ?? [],
        sourceUrl: selected.source_url ?? "",
      });
    }
  }, [mode, selected]);

  // URL로 detail 모드 직접 접근 시 참가자 로드
  useEffect(() => {
    if (mode === "detail" && selected) {
      loadRegistrations(selected.id);
    }
  }, [mode, selected]);

  const openDetail = (comp: Competition) => {
    setSelectedId(comp.id);
    setMode("detail");
    loadRegistrations(comp.id);
  };

  const openEdit = (comp: Competition) => {
    setSelectedId(comp.id);
    setForm({
      title: comp.title,
      sport: comp.sport ?? "road_run",
      startDate: comp.start_date,
      endDate: comp.end_date ?? "",
      location: comp.location ?? "",
      eventTypes: comp.event_types ?? [],
      sourceUrl: comp.source_url ?? "",
    });
    setMode("edit");
  };

  const openCreate = () => {
    setSelectedId("");
    setForm({
      title: "",
      sport: "road_run",
      startDate: "",
      endDate: "",
      location: "",
      eventTypes: [],
      sourceUrl: "",
    });
    setMode("create");
  };

  const currentSportConfig = resolveSportConfig(form.sport);

  const toggleEventType = (et: string) => {
    setForm((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(et)
        ? prev.eventTypes.filter((e) => e !== et)
        : [...prev.eventTypes, et],
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.startDate) {
      alert("대회명과 시작일은 필수입니다");
      return;
    }
    setSaving(true);

    if (mode === "create") {
      const result = await createCompetition({
        title: form.title,
        sport: form.sport,
        startDate: form.startDate,
        endDate: form.endDate || null,
        location: form.location,
        eventTypes: form.eventTypes,
        sourceUrl: form.sourceUrl,
      });
      if (!result.ok) {
        alert(result.message);
        setSaving(false);
        return;
      }
    } else if (mode === "edit" && selected) {
      const result = await updateCompetition(selected.id, {
        title: form.title,
        sport: form.sport,
        startDate: form.startDate,
        endDate: form.endDate || null,
        location: form.location,
        eventTypes: form.eventTypes,
        sourceUrl: form.sourceUrl,
      });
      if (!result.ok) {
        alert(result.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setMode("list");
    setSelectedId("");
    loadCompetitions();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("대회를 삭제하시겠습니까? 참가 등록도 함께 삭제됩니다."))
      return;
    const result = await deleteCompetition(id);
    if (result.ok) {
      setMode("list");
      setSelectedId("");
      loadCompetitions();
    } else {
      alert(result.message);
    }
  };

  const handleDeleteRegistration = async (regId: string) => {
    if (!confirm("참가를 취소하시겠습니까?")) return;
    const result = await deleteRegistration(regId);
    if (result.ok) {
      setRegistrations((prev) => prev.filter((r) => r.id !== regId));
    } else {
      alert(result.message);
    }
  };

  // 생성/수정 폼
  if (mode === "create" || mode === "edit") {
    return (
      <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <H2>{mode === "create" ? "대회 등록" : "대회 수정"}</H2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => { setMode("list"); setSelectedId(""); }}
            className="text-muted-foreground"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* 대회명 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">대회명</label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="대회 이름"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        {/* 종목 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">종목</label>
          <Select
            value={form.sport}
            onValueChange={(v) =>
              setForm({ ...form, sport: v, eventTypes: [] })
            }
          >
            <SelectTrigger className="h-12 rounded-xl border-[1.5px] text-[15px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPORT_OPTIONS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 날짜 */}
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              시작일
            </label>
            <Input
              type="date"
              max="9999-12-31"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              종료일
            </label>
            <Input
              type="date"
              max="9999-12-31"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
          </div>
        </div>

        {/* 장소 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">장소</label>
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="서울 여의도"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        {/* 세부종목 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            세부종목
          </label>
          <div className="flex flex-wrap gap-2">
            {currentSportConfig.eventTypes.map((et) => (
              <Button
                key={et}
                variant="outline"
                size="sm"
                onClick={() => toggleEventType(et)}
                className={cn(
                  "rounded-lg text-[13px] font-medium",
                  form.eventTypes.includes(et)
                    ? "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                    : "text-muted-foreground",
                )}
              >
                {et}
              </Button>
            ))}
          </div>
        </div>

        {/* URL */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            대회 URL (선택)
          </label>
          <Input
            value={form.sourceUrl}
            onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
            placeholder="https://..."
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        {/* 저장 */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-[52px] w-full rounded-xl text-base font-semibold"
        >
          {saving
            ? "저장 중..."
            : mode === "create"
              ? "등록"
              : "수정"}
        </Button>
      </div>
    );
  }

  // 대회 상세 (참가자 포함)
  if (mode === "detail" && selected) {
    const sportConfig = resolveSportConfig(selected.sport);
    const roleLabels: Record<string, string> = {
      participant: "참가",
      cheering: "응원",
      volunteer: "봉사",
    };

    return (
      <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <H2>대회 상세</H2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => { setMode("list"); setSelectedId(""); }}
            className="text-muted-foreground"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* 대회 정보 카드 */}
        <CardItem className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <Badge className={cn("text-[11px]", sportConfig.chipClass)}>
              {sportConfig.label}
            </Badge>
            {selected.event_types?.map((et) => (
              <Badge key={et} variant="outline" className="text-[11px]">
                {et}
              </Badge>
            ))}
          </div>
          <h2 className="text-lg font-bold text-foreground">
            {selected.title}
          </h2>
          <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="size-3.5" />
              <span>
                {selected.start_date}
                {selected.end_date && ` ~ ${selected.end_date}`}
              </span>
            </div>
            {selected.location && (
              <div className="flex items-center gap-2">
                <MapPin className="size-3.5" />
                <span>{selected.location}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => openEdit(selected)}
              className="flex-1 rounded-xl py-3 text-[14px] font-medium"
            >
              <Pencil className="size-3.5" />
              수정
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDelete(selected.id)}
              className="flex-1 rounded-xl py-3 text-[14px] font-medium text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              삭제
            </Button>
          </div>
        </CardItem>

        {/* 참가자 목록 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <span className="text-[15px] font-semibold text-foreground">
              참가자 ({registrations.length})
            </span>
          </div>

          {regLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))
          ) : registrations.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-muted-foreground">
              참가자가 없습니다
            </p>
          ) : (
            registrations.map((reg) => (
              <div
                key={reg.id}
                className="flex items-center justify-between rounded-xl border-[1.5px] border-border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[14px] font-medium text-foreground">
                    {reg.member?.full_name ?? "이름 없음"}
                  </span>
                  <Badge variant="secondary" className="text-[11px]">
                    {roleLabels[reg.role] ?? reg.role}
                  </Badge>
                  {reg.event_type && (
                    <Badge variant="outline" className="text-[11px]">
                      {reg.event_type}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDeleteRegistration(reg.id)}
                  className="text-muted-foreground active:text-destructive"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 목록
  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <H2>대회 관리</H2>
        <Button
          size="icon"
          onClick={openCreate}
          className="rounded-xl"
        >
          <Plus className="size-5" />
        </Button>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="대회명 검색"
          className="h-12 rounded-xl border-[1.5px] pl-10 text-[15px]"
        />
      </div>

      {/* 필터 */}
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

      <span className="text-[13px] text-muted-foreground">
        {filtered.length}개
      </span>

      {/* 대회 목록 */}
      <div className="flex flex-col gap-3">
        {filtered.map((comp) => {
          const sportConfig = resolveSportConfig(comp.sport);
          return (
            <CardItem asChild key={comp.id} className="flex flex-col gap-2.5">
              <button
                onClick={() => openDetail(comp)}
                className="text-left transition-colors active:bg-secondary"
              >
              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    "border-transparent text-[11px]",
                    sportConfig.chipClass,
                  )}
                >
                  {sportConfig.label}
                </Badge>
                {comp.start_date < today && (
                  <Badge variant="secondary" className="text-[11px]">
                    종료
                  </Badge>
                )}
              </div>
              <span className="text-[15px] font-semibold text-foreground">
                {comp.title}
              </span>
              <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  <span>{comp.start_date}</span>
                </div>
                {comp.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    <span>{comp.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Users className="size-3" />
                  <span>{comp.registration_count}</span>
                </div>
              </div>
              </button>
            </CardItem>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Trophy className="size-12 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">대회가 없습니다</p>
        </div>
      )}
    </div>
  );
}
