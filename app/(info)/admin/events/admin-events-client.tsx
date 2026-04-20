"use client";

import { useEffect, useState, useCallback } from "react";
import { useQueryState, parseAsStringLiteral, parseAsString } from "nuqs";
import { createClient } from "@/lib/supabase/client";
import {
  createMultiplier,
  updateMultiplier,
  deleteMultiplier,
} from "@/app/actions/admin/manage-mileage";
import { Plus, Pencil, Trash2, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { H2, Body, Caption } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CardItem } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";

type ActiveEvent = {
  evt_id: string;
  evt_nm: string;
  evt_type_cd: string;
  stt_dt: string;
  end_dt: string;
  stts_enm: string;
};

type Multiplier = {
  mult_id: string;
  evt_id: string;
  mult_nm: string;
  mult_val: number;
  stt_dt: string | null;
  end_dt: string | null;
  active_yn: boolean;
  created_at: string;
};

const modes = ["list", "create", "edit"] as const;

export function AdminEventsClient({ teamId }: { teamId: string }) {
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [multipliers, setMultipliers] = useState<Multiplier[]>([]);
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
  const selected = multipliers.find((m) => m.mult_id === selectedId) ?? null;

  const [form, setForm] = useState({
    mult_nm: "",
    mult_val: "",
    stt_dt: "",
    end_dt: "",
    active_yn: true,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    // 활성 이벤트 조회 (ACTIVE 우선, 없으면 최근 이벤트)
    const { data: evts } = await supabase
      .from("evt_team_mst")
      .select("evt_id, evt_nm, evt_type_cd, stt_dt, end_dt, stts_enm")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    const activeEvt =
      (evts ?? []).find((e) => e.stts_enm === "ACTIVE") ??
      (evts ?? [])[0] ??
      null;

    setActiveEvent(activeEvt as ActiveEvent | null);

    if (activeEvt) {
      const { data: mults } = await supabase
        .from("evt_mlg_mult_cfg")
        .select(
          "mult_id, evt_id, mult_nm, mult_val, stt_dt, end_dt, active_yn, created_at",
        )
        .eq("evt_id", activeEvt.evt_id)
        .order("created_at", { ascending: false });

      setMultipliers((mults ?? []) as Multiplier[]);
    } else {
      setMultipliers([]);
    }

    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // URL로 edit 직접 접근 시 폼 채우기
  useEffect(() => {
    if (mode === "edit" && selected) {
      setForm({
        mult_nm: selected.mult_nm,
        mult_val: String(selected.mult_val),
        stt_dt: selected.stt_dt ?? "",
        end_dt: selected.end_dt ?? "",
        active_yn: selected.active_yn,
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
    setForm({ mult_nm: "", mult_val: "", stt_dt: "", end_dt: "", active_yn: true });
    setMode("create");
  };

  const openEdit = (mult: Multiplier) => {
    setSelectedId(mult.mult_id);
    setForm({
      mult_nm: mult.mult_nm,
      mult_val: String(mult.mult_val),
      stt_dt: mult.stt_dt ?? "",
      end_dt: mult.end_dt ?? "",
      active_yn: mult.active_yn,
    });
    setMode("edit");
  };

  const goBack = () => {
    setMode("list");
    setSelectedId("");
  };

  const handleSave = async () => {
    if (!form.mult_nm.trim()) {
      alert("배율명은 필수입니다");
      return;
    }
    const multVal = parseFloat(form.mult_val);
    if (isNaN(multVal) || multVal <= 0) {
      alert("배율값은 0보다 큰 숫자여야 합니다");
      return;
    }
    if (!activeEvent) return;

    setSaving(true);

    const input = {
      mult_nm: form.mult_nm,
      mult_val: multVal,
      stt_dt: form.stt_dt || null,
      end_dt: form.end_dt || null,
      active_yn: form.active_yn,
    };

    const result =
      mode === "create"
        ? await createMultiplier({ evt_id: activeEvent.evt_id, ...input })
        : await updateMultiplier(selectedId, input);

    setSaving(false);

    if (!result.ok) {
      alert(result.message);
      return;
    }

    goBack();
    loadData();
  };

  const handleDelete = async (multId: string) => {
    if (!confirm("배율을 삭제하시겠습니까?")) return;
    const result = await deleteMultiplier(multId);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    setMultipliers((prev) => prev.filter((m) => m.mult_id !== multId));
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-6 pt-4">
        <Skeleton className="h-8 w-36 rounded" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  // 생성/수정 폼
  if (mode === "create" || mode === "edit") {
    return (
      <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <H2>{mode === "create" ? "배율 추가" : "배율 수정"}</H2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goBack}
            className="text-muted-foreground"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* 배율명 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">배율명</label>
          <Input
            value={form.mult_nm}
            onChange={(e) => setForm({ ...form, mult_nm: e.target.value })}
            placeholder="트레일런 보너스"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        {/* 배율값 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            배율값 (예: 1.2 = 120%)
          </label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={form.mult_val}
            onChange={(e) => setForm({ ...form, mult_val: e.target.value })}
            placeholder="1.2"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        {/* 기간 */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              시작일 (선택)
            </label>
            <Input
              type="date"
              max="9999-12-31"
              value={form.stt_dt}
              onChange={(e) => setForm({ ...form, stt_dt: e.target.value })}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              종료일 (선택)
            </label>
            <Input
              type="date"
              max="9999-12-31"
              value={form.end_dt}
              onChange={(e) => setForm({ ...form, end_dt: e.target.value })}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
          </div>
        </div>

        {/* 활성 여부 */}
        <div className="flex items-center justify-between rounded-xl border-[1.5px] border-border px-4 py-3.5">
          <span className="text-[15px] font-medium text-foreground">활성화</span>
          <button
            type="button"
            role="switch"
            aria-checked={form.active_yn}
            onClick={() => setForm({ ...form, active_yn: !form.active_yn })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              form.active_yn ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`pointer-events-none inline-block size-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                form.active_yn ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-[52px] w-full rounded-xl text-base font-semibold"
        >
          {saving ? "저장 중..." : mode === "create" ? "추가" : "수정"}
        </Button>
      </div>
    );
  }

  // 목록
  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <H2>이벤트 관리</H2>

      {/* 현재 이벤트 정보 */}
      {activeEvent ? (
        <CardItem className="flex flex-col gap-2 bg-secondary/40">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <Body className="font-semibold">{activeEvent.evt_nm}</Body>
            <Badge
              variant={
                activeEvent.stts_enm === "ACTIVE"
                  ? "default"
                  : activeEvent.stts_enm === "CLOSED"
                    ? "outline"
                    : "secondary"
              }
              className="text-[11px]"
            >
              {activeEvent.stts_enm === "ACTIVE"
                ? "진행중"
                : activeEvent.stts_enm === "CLOSED"
                  ? "종료"
                  : "준비중"}
            </Badge>
          </div>
          <Caption>
            {activeEvent.stt_dt} ~ {activeEvent.end_dt}
          </Caption>
        </CardItem>
      ) : (
        <EmptyState message="등록된 이벤트가 없습니다. 프로젝트 관리에서 먼저 이벤트를 생성하세요." />
      )}

      {activeEvent && (
        <>
          {/* 배율 목록 헤더 */}
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-foreground">
              배율 목록 ({multipliers.length})
            </span>
            <Button size="sm" onClick={openCreate} className="rounded-xl gap-1.5">
              <Plus className="size-4" />
              배율 추가
            </Button>
          </div>

          {/* 활성 배율 */}
          {multipliers.filter((m) => m.active_yn).length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
                활성
              </span>
              {multipliers
                .filter((m) => m.active_yn)
                .map((mult) => (
                  <MultiplierRow
                    key={mult.mult_id}
                    mult={mult}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
            </div>
          )}

          {/* 비활성 배율 */}
          {multipliers.filter((m) => !m.active_yn).length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
                비활성
              </span>
              {multipliers
                .filter((m) => !m.active_yn)
                .map((mult) => (
                  <MultiplierRow
                    key={mult.mult_id}
                    mult={mult}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
            </div>
          )}

          {multipliers.length === 0 && (
            <EmptyState variant="card" message="등록된 배율이 없습니다." />
          )}
        </>
      )}
    </div>
  );
}

function MultiplierRow({
  mult,
  onEdit,
  onDelete,
}: {
  mult: Multiplier;
  onEdit: (m: Multiplier) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <CardItem className="flex items-center gap-3">
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-foreground">
            {mult.mult_nm}
          </span>
          <Badge
            variant={mult.active_yn ? "default" : "secondary"}
            className="text-[11px]"
          >
            ×{Number(mult.mult_val).toFixed(2)}
          </Badge>
        </div>
        {(mult.stt_dt || mult.end_dt) && (
          <Caption>
            {mult.stt_dt ?? ""}
            {mult.stt_dt && mult.end_dt ? " ~ " : ""}
            {mult.end_dt ?? ""}
          </Caption>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onEdit(mult)}
          className="rounded-lg"
          aria-label="수정"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onDelete(mult.mult_id)}
          className="rounded-lg text-destructive hover:text-destructive"
          aria-label="삭제"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </CardItem>
  );
}
