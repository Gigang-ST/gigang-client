"use client";

import { useEffect, useState } from "react";
import {
  createEvent,
  updateEvent,
  deleteEvent,
} from "@/app/actions/admin/manage-mileage";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CardItem } from "@/components/ui/card";
import { InfoRow } from "@/components/common/info-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Project = {
  evt_id: string;
  evt_nm: string;
  evt_type_cd: string;
  stt_dt: string;
  end_dt: string;
  stts_enm: string;
  desc_txt: string | null;
};

type Props = {
  project: Project | null;
  onSaved: (newEvtId?: string) => void;
  onCancel: () => void;
  onDeleted: () => void;
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

const EVT_TYPE_LABELS: Record<string, string> = {
  MILEAGE_RUN: "마일리지런",
};

export function ProjectInfoTab({ project, onSaved, onCancel, onDeleted }: Props) {
  const isCreate = project === null;
  const [editing, setEditing] = useState(isCreate);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    evt_nm: project?.evt_nm ?? "",
    evt_type_cd: project?.evt_type_cd ?? "MILEAGE_RUN",
    stt_dt: project?.stt_dt ?? "",
    end_dt: project?.end_dt ?? "",
    stts_enm: project?.stts_enm ?? "READY",
    desc_txt: project?.desc_txt ?? "",
  });

  useEffect(() => {
    setEditing(project === null);
    setForm({
      evt_nm: project?.evt_nm ?? "",
      evt_type_cd: project?.evt_type_cd ?? "MILEAGE_RUN",
      stt_dt: project?.stt_dt ?? "",
      end_dt: project?.end_dt ?? "",
      stts_enm: project?.stts_enm ?? "READY",
      desc_txt: project?.desc_txt ?? "",
    });
  }, [project]);

  const handleSave = async () => {
    if (!form.evt_nm.trim()) {
      alert("이벤트명은 필수입니다");
      return;
    }
    if (!form.stt_dt || !form.end_dt) {
      alert("시작일과 종료일은 필수입니다");
      return;
    }
    if (form.stt_dt > form.end_dt) {
      alert("종료일은 시작일 이후여야 합니다");
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

    if (isCreate) {
      const result = await createEvent(input);
      setSaving(false);
      if (!result.ok) {
        alert(result.message);
        return;
      }
      onSaved(result.evt_id);
    } else {
      const result = await updateEvent(project.evt_id, input);
      setSaving(false);
      if (!result.ok) {
        alert(result.message);
        return;
      }
      setEditing(false);
      onSaved();
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "이벤트를 삭제하시겠습니까? 배율, 참여자, 활동 기록이 모두 삭제됩니다.",
      )
    )
      return;
    const result = await deleteEvent(project!.evt_id);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    onDeleted();
  };

  const handleCancel = () => {
    if (isCreate) {
      onCancel();
    } else {
      setEditing(false);
      setForm({
        evt_nm: project.evt_nm,
        evt_type_cd: project.evt_type_cd,
        stt_dt: project.stt_dt,
        end_dt: project.end_dt,
        stts_enm: project.stts_enm,
        desc_txt: project.desc_txt ?? "",
      });
    }
  };

  // 뷰 모드
  if (!isCreate && !editing) {
    const badge = STATUS_BADGE[project!.stts_enm] ?? STATUS_BADGE.READY;
    return (
      <CardItem className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <Badge variant={badge.variant} className="text-[11px]">
            {badge.label}
          </Badge>
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setEditing(true)}
              className="rounded-lg"
              aria-label="수정"
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleDelete}
              className="rounded-lg text-destructive hover:text-destructive"
              aria-label="삭제"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
        <div>
          <InfoRow label="이름" value={project!.evt_nm} />
          <InfoRow
            label="유형"
            value={EVT_TYPE_LABELS[project!.evt_type_cd] ?? project!.evt_type_cd}
          />
          <InfoRow
            label="기간"
            value={`${project!.stt_dt} ~ ${project!.end_dt}`}
          />
          {project!.desc_txt && (
            <InfoRow label="설명" value={project!.desc_txt} />
          )}
        </div>
      </CardItem>
    );
  }

  // 편집/생성 폼
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="text-[18px] font-semibold text-foreground">
          {isCreate ? "새 프로젝트 생성" : "프로젝트 수정"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCancel}
          className="text-muted-foreground"
        >
          <X className="size-5" />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">이벤트명</label>
        <Input
          value={form.evt_nm}
          onChange={(e) => setForm({ ...form, evt_nm: e.target.value })}
          placeholder="2025 마일리지런"
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
        />
      </div>

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
        {saving ? "저장 중..." : isCreate ? "생성" : "수정"}
      </Button>
    </div>
  );
}
