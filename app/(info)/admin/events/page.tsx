"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getEventMultipliers,
  createEventMultiplier,
  updateEventMultiplier,
  deleteEventMultiplier,
  type EventMultiplier,
} from "@/app/actions/admin/manage-event-multiplier";
import {
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function EventMultipliersPage() {
  const [events, setEvents] = useState<EventMultiplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventMultiplier | null>(null);
  const [actioning, setActioning] = useState(false);

  // 폼 상태
  const [formName, setFormName] = useState("");
  const [formMultiplier, setFormMultiplier] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: project } = await supabase
      .from("project")
      .select("id")
      .eq("status", "active")
      .maybeSingle();

    if (!project) {
      setLoading(false);
      return;
    }

    setProjectId(project.id);
    const result = await getEventMultipliers(project.id);
    if (result.ok) {
      setEvents(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setFormName("");
    setFormMultiplier("");
    setFormStartDate("");
    setFormEndDate("");
    setEditingEvent(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (event: EventMultiplier) => {
    setEditingEvent(event);
    setFormName(event.name);
    setFormMultiplier(String(event.multiplier));
    setFormStartDate(event.start_date ?? "");
    setFormEndDate(event.end_date ?? "");
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!projectId || !formName.trim() || !formMultiplier) return;

    const multiplierNum = parseFloat(formMultiplier);
    if (isNaN(multiplierNum) || multiplierNum <= 0) {
      alert("배율은 0보다 큰 숫자여야 합니다");
      return;
    }

    if (formStartDate && formEndDate && formEndDate < formStartDate) {
      alert("종료일은 시작일 이후여야 합니다");
      return;
    }

    setActioning(true);

    if (editingEvent) {
      const result = await updateEventMultiplier(editingEvent.id, {
        name: formName,
        multiplier: multiplierNum,
        start_date: formStartDate || null,
        end_date: formEndDate || null,
      });
      if (result.ok) {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === editingEvent.id
              ? {
                  ...e,
                  name: formName.trim(),
                  multiplier: multiplierNum,
                  start_date: formStartDate || null,
                  end_date: formEndDate || null,
                }
              : e,
          ),
        );
        resetForm();
      } else {
        alert(result.message);
      }
    } else {
      const result = await createEventMultiplier({
        project_id: projectId,
        name: formName,
        multiplier: multiplierNum,
        start_date: formStartDate || null,
        end_date: formEndDate || null,
      });
      if (result.ok) {
        await loadData();
        resetForm();
      } else {
        alert(result.message);
      }
    }

    setActioning(false);
  };

  const handleToggleActive = async (event: EventMultiplier) => {
    setActioning(true);
    const result = await updateEventMultiplier(event.id, {
      is_active: !event.is_active,
    });
    if (result.ok) {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id ? { ...e, is_active: !e.is_active } : e,
        ),
      );
    } else {
      alert(result.message);
    }
    setActioning(false);
  };

  const handleDelete = async (event: EventMultiplier) => {
    if (!confirm(`"${event.name}" 이벤트 배율을 삭제하시겠습니까?`)) return;
    setActioning(true);
    const result = await deleteEventMultiplier(event.id);
    if (result.ok) {
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
    } else {
      alert(result.message);
    }
    setActioning(false);
  };

  const formatDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date + "T00:00:00").toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-6 pt-4">
        <Skeleton className="h-8 w-40 rounded" />
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
          이벤트 배율 관리
        </h1>
        <div className="flex flex-col items-center gap-3 py-16">
          <Sparkles className="size-12 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">
            활성 프로젝트가 없습니다
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">
          이벤트 배율 관리
        </h1>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-colors active:bg-primary/90"
        >
          <Plus className="size-4" />
          추가
        </button>
      </div>

      {/* 이벤트 수 */}
      <span className="text-[13px] text-muted-foreground">
        전체 {events.length}개 · 활성{" "}
        {events.filter((e) => e.is_active).length}개
      </span>

      {/* 이벤트 목록 */}
      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <Sparkles className="size-12 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">
            등록된 이벤트 배율이 없습니다
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((event) => {
            const period =
              event.start_date || event.end_date
                ? `${formatDate(event.start_date) ?? "시작일 없음"} ~ ${formatDate(event.end_date) ?? "종료일 없음"}`
                : null;

            return (
              <div
                key={event.id}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border-[1.5px] border-border p-4 transition-colors",
                  !event.is_active && "opacity-50",
                )}
              >
                {/* 상단: 이름, 배율, 활성 토글 */}
                <div className="flex items-center gap-3">
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-foreground">
                        {event.name}
                      </span>
                      <Badge
                        variant={event.is_active ? "default" : "secondary"}
                        className="text-[11px]"
                      >
                        x{event.multiplier}
                      </Badge>
                    </div>
                    {period && (
                      <span className="text-[13px] text-muted-foreground">
                        {period}
                      </span>
                    )}
                  </div>
                  <Switch
                    checked={event.is_active}
                    onCheckedChange={() => handleToggleActive(event)}
                    disabled={actioning}
                  />
                </div>

                {/* 하단: 수정/삭제 버튼 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditForm(event)}
                    disabled={actioning}
                    className="flex items-center gap-1.5 rounded-lg border-[1.5px] border-border px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors active:bg-secondary disabled:opacity-50"
                  >
                    <Pencil className="size-3" />
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(event)}
                    disabled={actioning}
                    className="flex items-center gap-1.5 rounded-lg border-[1.5px] border-border px-3 py-1.5 text-[13px] font-medium text-destructive transition-colors active:bg-secondary disabled:opacity-50"
                  >
                    <Trash2 className="size-3" />
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 추가/수정 시트 */}
      <Sheet open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>
              {editingEvent ? "이벤트 배율 수정" : "이벤트 배율 추가"}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4 pt-4 pb-8">
            {/* 이름 */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                이벤트 이름
              </label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="예: 주말 더블 포인트"
                className="h-12 rounded-xl border-[1.5px] text-[15px]"
              />
            </div>

            {/* 배율 */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                배율
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={formMultiplier}
                onChange={(e) => setFormMultiplier(e.target.value)}
                placeholder="예: 2.00"
                className="h-12 rounded-xl border-[1.5px] text-[15px]"
              />
            </div>

            {/* 시작일 */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                시작일 (선택)
              </label>
              <Input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className="h-12 rounded-xl border-[1.5px] text-[15px]"
              />
            </div>

            {/* 종료일 */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                종료일 (선택)
              </label>
              <Input
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                className="h-12 rounded-xl border-[1.5px] text-[15px]"
              />
            </div>

            {/* 제출 버튼 */}
            <button
              onClick={handleSubmit}
              disabled={actioning || !formName.trim() || !formMultiplier}
              className="mt-2 flex h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors active:bg-primary/90 disabled:opacity-50"
            >
              {editingEvent ? "수정" : "추가"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
