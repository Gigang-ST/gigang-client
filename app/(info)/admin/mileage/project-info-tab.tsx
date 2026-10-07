"use client";

import { useEffect, useState } from "react";
import {
  createEvent,
  updateEvent,
  deleteEvent,
} from "@/app/actions/admin/manage-mileage";
import { getPbClassAdminBoard, savePbCfg } from "@/app/actions/admin/manage-pb-class";
import { Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { parseEventTime } from "@/lib/dayjs";
import { PB_CLASS_DEFAULT_CFG, PB_CLASS_TYPE, type PbClassCfg } from "@/lib/pb-class";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CardItem } from "@/components/ui/card";
import { Caption } from "@/components/common/typography";
import { InfoRow } from "@/components/common/info-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PbCfgFields, parsePbCfgForm, toPbCfgForm, type PbCfgForm } from "./pb-cfg-fields";

type Project = {
  evt_id: string;
  evt_nm: string;
  evt_type_cd: string;
  stt_dt: string;
  end_dt: string;
  stts_enm: "READY" | "ACTIVE" | "CLOSED";
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
  [PB_CLASS_TYPE]: "겨울 PB 클래스",
};

const DEFAULT_CFG_FORM = toPbCfgForm(PB_CLASS_DEFAULT_CFG);

export function ProjectInfoTab({ project, onSaved, onCancel, onDeleted }: Props) {
  const isCreate = project === null;
  const [editing, setEditing] = useState(isCreate);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{
    evt_nm: string;
    evt_type_cd: string;
    stt_dt: string;
    end_dt: string;
    stts_enm: "READY" | "ACTIVE" | "CLOSED";
    desc_txt: string;
  }>({
    evt_nm: project?.evt_nm ?? "",
    evt_type_cd: project?.evt_type_cd ?? "MILEAGE_RUN",
    stt_dt: project?.stt_dt ?? "",
    end_dt: project?.end_dt ?? "",
    stts_enm: project?.stts_enm ?? "READY",
    desc_txt: project?.desc_txt ?? "",
  });

  // PB 클래스 설정 — 폼 값과 서버에 저장된 값을 따로 든다(취소 시 저장값으로 되돌리려고).
  // 서버 보드가 올 때까지는 기본값이고, 아직 한 번도 저장 안 된 프로젝트는 `cfgSaved=false`다.
  const [cfgForm, setCfgForm] = useState<PbCfgForm>(DEFAULT_CFG_FORM);
  const [savedCfgForm, setSavedCfgForm] = useState<PbCfgForm>(DEFAULT_CFG_FORM);
  const [cfgSaved, setCfgSaved] = useState(true);
  // 보드가 오기 전엔 기본값이 "저장된 설정"처럼 번쩍이지 않게 뷰 모드의 설정 행을 숨긴다
  const [cfgLoaded, setCfgLoaded] = useState(false);

  const isPbForm = form.evt_type_cd === PB_CLASS_TYPE;

  // 프로젝트가 바뀌면 부모가 `key`로 이 컴포넌트를 새로 마운트한다 — 폼을 effect로 덮어쓰지 않는다
  // (effect 안 setState는 렌더를 한 번 더 돌리고, 저장 직후 목록이 다시 오면 편집 중인 값을 날린다).

  // 저장된 PB 프로젝트면 설정을 서버에서 읽어 채운다. 마일리지런엔 설정이 없어 조회하지 않는다.
  const savedEvtId = project?.evt_id;
  const savedIsPb = project?.evt_type_cd === PB_CLASS_TYPE;
  useEffect(() => {
    if (!savedEvtId || !savedIsPb) return;
    let cancelled = false;
    void getPbClassAdminBoard(savedEvtId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        // 못 읽으면 편집을 잠근 채 둔다(아래 수정 버튼) — 기본값이 저장값을 덮어쓰지 않게
        toast.error(res.message ?? "PB 설정을 불러오지 못했어요. 새로고침해 주세요.");
        return;
      }
      const next = toPbCfgForm(res.board.cfg);
      setCfgForm(next);
      setSavedCfgForm(next);
      setCfgSaved(res.board.cfgSaved);
      setCfgLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [savedEvtId, savedIsPb]);

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

    let pbCfg: PbClassCfg | null = null;
    if (isPbForm) {
      const parsed = parsePbCfgForm(cfgForm);
      if ("error" in parsed) {
        toast.error(parsed.error);
        return;
      }
      pbCfg = parsed.cfg;
      // 정보부터 저장한 뒤 설정에서 막히면 반쯤 저장된 상태가 남는다 — 저장을 시작하기 전에 거른다
      if (!isCreate && savedIsPb && !cfgLoaded) {
        toast.error("PB 설정을 아직 불러오지 못했어요. 새로고침 후 다시 저장해 주세요.");
        return;
      }
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
      if (!result.ok) {
        setSaving(false);
        alert(result.message);
        return;
      }
      // 이벤트는 이미 만들어졌다 — 설정 저장이 실패해도 목록으로는 보내 정보 탭에서 다시 저장하게 한다
      if (pbCfg && result.evt_id) {
        const cfgRes = await savePbCfg(result.evt_id, pbCfg);
        if (!cfgRes.ok) {
          toast.error(
            cfgRes.message ?? "프로젝트는 만들었지만 PB 설정을 저장하지 못했어요. 정보 탭에서 다시 저장해 주세요.",
          );
        }
      }
      setSaving(false);
      onSaved(result.evt_id);
    } else {
      const result = await updateEvent(project.evt_id, input);
      if (!result.ok) {
        setSaving(false);
        alert(result.message);
        return;
      }
      // 설정은 **실제로 바뀌었을 때만** 저장한다. 상태를 종료로 바꾸는 것 같은 정보 수정이
      // 설정 행을 매번 다시 쓰면, 어긋난 폼 값 하나가 환급 기준을 조용히 바꾼다.
      const cfgChanged =
        !cfgSaved || !savedIsPb || JSON.stringify(cfgForm) !== JSON.stringify(savedCfgForm);
      if (pbCfg && cfgChanged) {
        const cfgRes = await savePbCfg(project.evt_id, pbCfg);
        if (!cfgRes.ok) {
          setSaving(false);
          toast.error(cfgRes.message ?? "PB 설정을 저장하지 못했어요. 다시 시도해 주세요.");
          return;
        }
        setSavedCfgForm(cfgForm);
        setCfgSaved(true);
      }
      setSaving(false);
      setEditing(false);
      onSaved();
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        project!.evt_type_cd === PB_CLASS_TYPE
          ? "이벤트를 삭제하시겠습니까? 연결된 회차 지정이 함께 삭제됩니다. (참가자가 있으면 삭제되지 않아요)"
          : "이벤트를 삭제하시겠습니까? 배율, 참여자, 활동 기록이 모두 삭제됩니다.",
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
      setCfgForm(savedCfgForm);
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
              // PB 설정이 오기 전에 편집을 열면 폼에 기본값이 들어 있어, 정보만 고쳐 저장해도
              // 설정이 기본값으로 덮인다 — 환급은 실시간 계산이라 전원 금액이 소급해서 바뀐다.
              disabled={savedIsPb && !cfgLoaded}
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
          {savedIsPb && cfgLoaded && (
            <>
              <InfoRow label="총 회차" value={`${savedCfgForm.totSessCnt}회`} />
              <InfoRow label="전액 환급 기준" value={`${savedCfgForm.fullRfndAttdCnt}회 출석`} />
              <InfoRow label="늦은 합류" value={`W${savedCfgForm.lateJoinWkNo}부터 보증금 없음`} />
              <InfoRow label="보증금" value={`${Number(savedCfgForm.depositAmt).toLocaleString()}원`} />
              <InfoRow label="참가비" value={`${Number(savedCfgForm.entryFeeAmt).toLocaleString()}원`} />
            </>
          )}
        </div>
        {savedIsPb && cfgLoaded && !cfgSaved && (
          <Caption className="text-warning">
            PB 설정이 아직 저장되지 않아 기본값으로 동작 중이에요. 수정에서 저장해 주세요.
          </Caption>
        )}
      </CardItem>
    );
  }

  // 시작일이 W1이다 — 주 경계(수 00:00 ~ 화 23:59)가 stt_dt에서 파생되므로 수요일이 아니면 주차가 어긋난다
  const sttDay = isPbForm && form.stt_dt ? parseEventTime(form.stt_dt) : null;
  const sttNotWednesday = sttDay !== null && sttDay.day() !== 3;

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
          placeholder={isPbForm ? "겨울 10K PB 클래스" : "2025 마일리지런"}
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
            <SelectItem value={PB_CLASS_TYPE}>겨울 PB 클래스</SelectItem>
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
          {isPbForm && (
            <Caption>
              시작일이 W1이에요. 주차는 수요일~화요일로 끊기니 시작일을 수요일로 설정해 주세요.
            </Caption>
          )}
          {sttNotWednesday && sttDay && (
            <Caption className="text-warning">
              선택한 시작일은 {sttDay.format("dddd")}이에요. 수요일이 아니면 주차 경계가 어긋나요.
            </Caption>
          )}
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
          onValueChange={(v) => setForm({ ...form, stts_enm: v as "READY" | "ACTIVE" | "CLOSED" })}
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

      {isPbForm && <PbCfgFields value={cfgForm} onChange={setCfgForm} />}

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
