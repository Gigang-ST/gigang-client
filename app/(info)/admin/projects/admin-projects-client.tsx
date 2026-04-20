"use client";

import { useEffect, useState, useCallback } from "react";
import { useQueryState, parseAsStringLiteral, parseAsString } from "nuqs";
import { createClient } from "@/lib/supabase/client";
import {
  createEvent,
  updateEvent,
  deleteEvent,
} from "@/app/actions/admin/manage-mileage";
import { Plus, Pencil, Trash2, X, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { H2 } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CardItem } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Event = {
  evt_id: string;
  evt_nm: string;
  evt_type_cd: string;
  stt_dt: string;
  end_dt: string;
  stts_enm: string;
  desc_txt: string | null;
  created_at: string;
};

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  READY: { label: "준비중", variant: "secondary" },
  ACTIVE: { label: "진행중", variant: "default" },
  CLOSED: { label: "종료", variant: "outline" },
};

const STATUS_OPTIONS = [
  { value: "READY", label: "준비중" },
  { value: "ACTIVE", label: "진행중" },
  { value: "CLOSED", label: "종료" },
];

const modes = ["list", "create", "edit"] as const;

export function AdminProjectsClient({ teamId }: { teamId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useQueryState(
    "mode",
    parseAsStringLiteral(modes).withDefault("list"),
  );
  const [selectedId, setSelectedId] = useQueryState(
    "id",
    parseAsString.withDefault(""),
  );
  const selected = events.find((e) => e.evt_id === selectedId) ?? null;

  const [form, setForm] = useState({
    evt_nm: "",
    evt_type_cd: "MILEAGE_RUN",
    stt_dt: "",
    end_dt: "",
    stts_enm: "READY",
    desc_txt: "",
  });

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("evt_team_mst")
      .select("evt_id, evt_nm, evt_type_cd, stt_dt, end_dt, stts_enm, desc_txt, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    setEvents((data ?? []) as Event[]);
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // URL로 edit 직접 접근 시 폼 채우기
  useEffect(() => {
    if (mode === "edit" && selected) {
      setForm({
        evt_nm: selected.evt_nm,
        evt_type_cd: selected.evt_type_cd,
        stt_dt: selected.stt_dt,
        end_dt: selected.end_dt,
        stts_enm: selected.stts_enm,
        desc_txt: selected.desc_txt ?? "",
      });
    }
  }, [mode, selected]);

  // 유효하지 않은 selectedId 처리
  useEffect(() => {
    if (mode === "edit" && selectedId && !selected && !loading) {
      setMode("list");
      setSelectedId("");
    }
  }, [mode, selectedId, selected, loading, setMode, setSelectedId]);

  const openCreate = () => {
    setSelectedId("");
    setForm({
      evt_nm: "",
      evt_type_cd: "MILEAGE_RUN",
      stt_dt: "",
      end_dt: "",
      stts_enm: "READY",
      desc_txt: "",
    });
    setMode("create");
  };

  const openEdit = (evt: Event) => {
    setSelectedId(evt.evt_id);
    setForm({
      evt_nm: evt.evt_nm,
      evt_type_cd: evt.evt_type_cd,
      stt_dt: evt.stt_dt,
      end_dt: evt.end_dt,
      stts_enm: evt.stts_enm,
      desc_txt: evt.desc_txt ?? "",
    });
    setMode("edit");
  };

  const goBack = () => {
    setMode("list");
    setSelectedId("");
  };

  const handleSave = async () => {
    if (!form.evt_nm.trim()) {
      alert("이벤트명은 필수입니다");
      return;
    }
    if (!form.stt_dt || !form.end_dt) {
      alert("시작일과 종료일은 필수입니다");
      return;
    }
    setSaving(true);

    const input = {
      evt_nm: form.evt_nm,
      evt_type_cd: form.evt_type_cd,
      stt_dt: form.stt_dt,
      end_dt: form.end_dt,
      stts_enm: form.stts_enm,
      desc_txt: form.desc_txt || null,
    };

    const result =
      mode === "create"
        ? await createEvent(input)
        : await updateEvent(selectedId, input);

    setSaving(false);

    if (!result.ok) {
      alert(result.message);
      return;
    }

    goBack();
    loadEvents();
  };

  const handleDelete = async (evtId: string) => {
    if (!confirm("이벤트를 삭제하시겠습니까? 배율, 참여자, 활동 기록이 모두 삭제됩니다."))
      return;
    const result = await deleteEvent(evtId);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    loadEvents();
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-6 pt-4">
        <Skeleton className="h-8 w-36 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  // 생성/수정 폼
  if (mode === "create" || mode === "edit") {
    return (
      <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <H2>{mode === "create" ? "이벤트 생성" : "이벤트 수정"}</H2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goBack}
            className="text-muted-foreground"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* 이벤트명 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">이벤트명</label>
          <Input
            value={form.evt_nm}
            onChange={(e) => setForm({ ...form, evt_nm: e.target.value })}
            placeholder="2025 마일리지런"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        {/* 이벤트 유형 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">이벤트 유형</label>
          <Select
            value={form.evt_type_cd}
            onValueChange={(v) => setForm({ ...form, evt_type_cd: v })}
          >
            <SelectTrigger className="h-12 rounded-xl border-[1.5px] text-[15px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MILEAGE_RUN">마일리지런</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 날짜 */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">시작일</label>
            <Input
              type="date"
              max="9999-12-31"
              value={form.stt_dt}
              onChange={(e) => setForm({ ...form, stt_dt: e.target.value })}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">종료일</label>
            <Input
              type="date"
              max="9999-12-31"
              value={form.end_dt}
              onChange={(e) => setForm({ ...form, end_dt: e.target.value })}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
          </div>
        </div>

        {/* 상태 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">상태</label>
          <Select
            value={form.stts_enm}
            onValueChange={(v) => setForm({ ...form, stts_enm: v })}
          >
            <SelectTrigger className="h-12 rounded-xl border-[1.5px] text-[15px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 설명 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">설명 (선택)</label>
          <textarea
            value={form.desc_txt}
            onChange={(e) => setForm({ ...form, desc_txt: e.target.value })}
            placeholder="이벤트 설명을 입력하세요"
            rows={3}
            className={cn(
              "w-full rounded-xl border-[1.5px] border-border bg-background px-3 py-3 text-[15px] text-foreground",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
              "resize-none",
            )}
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-[52px] w-full rounded-xl text-base font-semibold"
        >
          {saving ? "저장 중..." : mode === "create" ? "생성" : "수정"}
        </Button>
      </div>
    );
  }

  // 목록
  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <H2>프로젝트 관리</H2>
        <Button size="icon" onClick={openCreate} className="rounded-xl">
          <Plus className="size-5" />
        </Button>
      </div>

      <span className="text-[13px] text-muted-foreground">
        {events.length}개
      </span>

      <div className="flex flex-col gap-3">
        {events.map((evt) => {
          const badge = STATUS_BADGE[evt.stts_enm] ?? STATUS_BADGE.READY;
          return (
            <CardItem key={evt.evt_id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant={badge.variant} className="text-[11px]">
                      {badge.label}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {evt.evt_type_cd}
                    </span>
                  </div>
                  <span className="text-[15px] font-semibold text-foreground">
                    {evt.evt_nm}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {evt.stt_dt} ~ {evt.end_dt}
                  </span>
                  {evt.desc_txt && (
                    <span className="line-clamp-2 text-[13px] text-muted-foreground">
                      {evt.desc_txt}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => openEdit(evt)}
                    className="rounded-lg"
                    aria-label="수정"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => handleDelete(evt.evt_id)}
                    className="rounded-lg text-destructive hover:text-destructive"
                    aria-label="삭제"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </CardItem>
          );
        })}
      </div>

      {events.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16">
          <FolderKanban className="size-12 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">
            등록된 이벤트가 없습니다
          </p>
        </div>
      )}
    </div>
  );
}
