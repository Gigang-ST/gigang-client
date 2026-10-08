"use client";

import { useEffect, useState } from "react";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getEventParticipantCount,
  setEventStatus,
} from "@/app/actions/admin/manage-mileage";
import { getPbClassAdminBoard, savePbCfg } from "@/app/actions/admin/manage-pb-class";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { parseEventTime } from "@/lib/dayjs";
import {
  PB_CLASS_DEFAULT_CFG,
  PB_CLASS_TYPE,
  pbEndDtFor,
  wkLabel,
  type PbClassCfg,
} from "@/lib/pb-class";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CardItem } from "@/components/ui/card";
import { Body, Caption } from "@/components/common/typography";
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

type Status = "READY" | "ACTIVE" | "CLOSED";

type Project = {
  evt_id: string;
  evt_nm: string;
  evt_type_cd: string;
  stt_dt: string;
  end_dt: string;
  stts_enm: Status;
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

/**
 * PB 종료일 미리보기 — 폼의 시작일 + 총 회차로 **입력하는 즉시** 계산한다.
 *
 * 서버가 저장할 때 같은 `pbEndDtFor`로 다시 계산하므로(클라이언트 값은 무시된다) 이건 화면용 거울이다.
 * 총 회차 칸이 비었거나 하한(2회) 미만이면 저장도 막히는 입력이라 계산하지 않고 null — 엉뚱한 날짜를
 * 보여 주느니 비워 두는 편이 낫다.
 */
export function previewPbEndDt(sttDt: string, totSessCntText: string): string | null {
  const tot = /^\d+$/.test(totSessCntText.trim()) ? Number(totSessCntText.trim()) : Number.NaN;
  if (!sttDt || !Number.isInteger(tot) || tot < 2) return null;
  const end = pbEndDtFor(sttDt, { ...PB_CLASS_DEFAULT_CFG, totSessCnt: tot });
  // 연도 칸을 입력하는 도중(예: 0002)에는 형식이 깨진 날짜가 나올 수 있다
  return /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : null;
}

export function ProjectInfoTab({ project, onSaved, onCancel, onDeleted }: Props) {
  const isCreate = project === null;
  const [editing, setEditing] = useState(isCreate);
  const [saving, setSaving] = useState(false);
  // 공개·종료·다시 열기 처리 중 — 버튼 연타로 같은 요청이 두 번 나가지 않게 한다
  const [statusBusy, setStatusBusy] = useState(false);
  // 삭제 링크는 참가자 0명이 **확인된** 뒤에만 연다. 조회 전·실패는 false로 둬서
  // 모르는 채로 지우는 길이 열리지 않게 한다(보증금·기록은 종료로 보관하는 게 원칙).
  const [deletable, setDeletable] = useState(false);

  const [form, setForm] = useState<{
    evt_nm: string;
    evt_type_cd: string;
    stt_dt: string;
    end_dt: string;
    stts_enm: Status;
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

  // 참가자 수 — 삭제 링크를 보일지 정한다(마일리지런·PB 공통). 서버가 삭제 때 한 번 더 막는다.
  useEffect(() => {
    if (!savedEvtId) return;
    let cancelled = false;
    getEventParticipantCount(savedEvtId)
      .then((res) => {
        if (!cancelled) setDeletable(res.ok && res.count === 0);
      })
      .catch(() => {
        // 실패하면 삭제 링크를 열지 않는다(deletable 기본값 유지)
      });
    return () => {
      cancelled = true;
    };
  }, [savedEvtId]);

  const handleSave = async () => {
    if (!form.evt_nm.trim()) {
      alert("이벤트명은 필수입니다");
      return;
    }
    // PB는 종료일을 입력받지 않는다(시작일에서 계산) — 마일리지런만 직접 받는다
    if (!form.stt_dt || (!isPbForm && !form.end_dt)) {
      alert(isPbForm ? "시작일은 필수입니다" : "시작일과 종료일은 필수입니다");
      return;
    }
    if (!isPbForm && form.stt_dt > form.end_dt) {
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
      // 검증을 통과한 설정으로 계산한다. 서버도 같은 식으로 덮어쓰지만, 보내는 값이 화면과
      // 다르면 "미리보기와 저장 결과가 다른" 순간이 생기므로 여기서도 같은 값을 보낸다.
      end_dt: pbCfg ? pbEndDtFor(form.stt_dt, pbCfg) : form.end_dt,
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

  /**
   * 상태 전환 — 공개하기(READY→ACTIVE) · 프로젝트 종료(ACTIVE→CLOSED) · 다시 열기(CLOSED→ACTIVE).
   *
   * 끝난 프로젝트를 지우지 않고 「지난 프로젝트」로 보관하는 게 이 흐름의 목적이다. 수정 폼의
   * 상태 셀렉트와 달리 정보를 건드리지 않고 상태만 바꾸는 서버 액션이라, PB 설정이 어긋난 폼 값으로
   * 덮일 일도 없다.
   */
  const changeStatus = async (next: Status, confirmMsg: string | null, okMsg: string) => {
    if (!project) return;
    if (confirmMsg && !confirm(confirmMsg)) return;
    setStatusBusy(true);
    try {
      const res = await setEventStatus(project.evt_id, next);
      if (!res.ok) {
        toast.error(res.message ?? "상태를 바꾸지 못했어요. 다시 시도해 주세요.");
        return;
      }
      toast.success(okMsg);
      // 목록을 다시 읽어 셀렉터의 그룹(진행 중·준비 중 ↔ 지난 프로젝트)과 이 카드를 맞춘다
      onSaved();
    } catch {
      toast.error("상태를 바꾸지 못했어요. 다시 시도해 주세요.");
    } finally {
      setStatusBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    const lead = "이 프로젝트를 삭제할까요?\n참가자가 없어서 지울 수 있어요.";
    const detail =
      project.evt_type_cd === PB_CLASS_TYPE
        ? "연결된 회차 지정·훈련표·설정이 함께 지워지고 되돌릴 수 없어요."
        : "배율 설정이 함께 지워지고 되돌릴 수 없어요.";
    if (!confirm(`${lead}\n${detail}\n(데이터를 남기려면 삭제 대신 프로젝트 종료를 쓰세요)`)) return;
    const result = await deleteEvent(project.evt_id);
    if (!result.ok) {
      toast.error(result.message ?? "삭제하지 못했어요. 다시 시도해 주세요.");
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
    const mlgDcAmt = Number(savedCfgForm.mlgDcAmt);
    return (
      <CardItem className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <Badge variant={badge.variant} className="text-[11px]">
            {badge.label}
          </Badge>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setEditing(true)}
            // PB 설정이 오기 전에 편집을 열면 폼에 기본값이 들어 있어, 정보만 고쳐 저장해도
            // 설정이 기본값으로 덮인다 — 환급은 실시간 계산이라 전원 금액이 소급해서 바뀐다.
            disabled={savedIsPb && !cfgLoaded}
            className="shrink-0 rounded-lg"
            aria-label="수정"
          >
            <Pencil className="size-3.5" />
          </Button>
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
              <InfoRow
                label="늦은 합류"
                value={`${wkLabel(Number(savedCfgForm.lateJoinWkNo))}부터 보증금 없음`}
              />
              <InfoRow label="보증금" value={`${Number(savedCfgForm.depositAmt).toLocaleString()}원`} />
              <InfoRow
                label="마일리지런 할인"
                value={mlgDcAmt > 0 ? `보증금 −${mlgDcAmt.toLocaleString()}원` : "없음"}
              />
              <InfoRow label="참가비" value={`${Number(savedCfgForm.entryFeeAmt).toLocaleString()}원`} />
            </>
          )}
        </div>
        {savedIsPb && cfgLoaded && !cfgSaved && (
          <Caption className="text-warning">
            PB 설정이 아직 저장되지 않아 기본값으로 동작 중이에요. 수정에서 저장해 주세요.
          </Caption>
        )}

        {/* 상태별 주 동작 — 지우지 않고 공개 → 종료(보관) → 다시 열기로 돌린다 */}
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {project!.stts_enm === "READY" && (
            <>
              <Button
                onClick={() =>
                  void changeStatus(
                    "ACTIVE",
                    "공개하면 회원 프로젝트 탭에 바로 보여요. 공개할까요?",
                    "프로젝트를 공개했어요",
                  )
                }
                disabled={statusBusy}
                className="h-12 w-full rounded-xl text-base font-semibold"
              >
                {statusBusy ? "처리 중..." : "공개하기"}
              </Button>
              <Caption>
                준비 중인 프로젝트는 회원 프로젝트 탭에 보이지 않아요.
                {project!.evt_type_cd === PB_CLASS_TYPE && " 공개하면 훈련표가 비어 있을 때 기본 훈련표가 자동으로 들어가요."}
              </Caption>
            </>
          )}
          {project!.stts_enm === "ACTIVE" && (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  void changeStatus(
                    "CLOSED",
                    "종료하면 회원 프로젝트 탭에서 내려가고 「지난 프로젝트」로 보관돼요. 기록·참가자 데이터는 그대로 남아요.",
                    "프로젝트를 종료했어요. 「지난 프로젝트」에서 볼 수 있어요",
                  )
                }
                disabled={statusBusy}
                className="h-12 w-full rounded-xl text-base font-semibold"
              >
                {statusBusy ? "처리 중..." : "프로젝트 종료"}
              </Button>
              <Caption>종료해도 지우지 않고 「지난 프로젝트」로 보관돼요</Caption>
            </>
          )}
          {project!.stts_enm === "CLOSED" && (
            <>
              <Button
                variant="outline"
                onClick={() => void changeStatus("ACTIVE", null, "프로젝트를 다시 열었어요")}
                disabled={statusBusy}
                className="h-12 w-full rounded-xl text-base font-semibold"
              >
                {statusBusy ? "처리 중..." : "다시 열기"}
              </Button>
              <Caption>「지난 프로젝트」로 보관 중이에요. 다시 열면 회원 프로젝트 탭에 보여요</Caption>
            </>
          )}
        </div>

        {/* 참가자가 0명일 때만 — 보증금·기록이 걸린 프로젝트는 지우는 길 자체를 보여 주지 않는다 */}
        {deletable && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={statusBusy}
            className="-mb-1 self-center py-2 disabled:opacity-50"
          >
            <Caption className="text-destructive underline underline-offset-2">이 프로젝트 삭제</Caption>
          </button>
        )}
      </CardItem>
    );
  }

  // 시작일이 1주차 첫날이다 — 주 경계(수 00:00 ~ 화 23:59)가 stt_dt에서 파생되므로 수요일이 아니면 주차가 어긋난다
  const sttDay = isPbForm && form.stt_dt ? parseEventTime(form.stt_dt) : null;
  const sttNotWednesday = sttDay !== null && sttDay.day() !== 3;

  // PB 종료일(자동) — 시작일·총 회차를 고치는 즉시 따라 움직인다
  const pbEndDt = isPbForm ? previewPbEndDt(form.stt_dt, cfgForm.totSessCnt) : null;
  const pbTotSessCnt = Number(cfgForm.totSessCnt);
  const pbTotValid = /^\d+$/.test(cfgForm.totSessCnt.trim()) && pbTotSessCnt >= 2;

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
          aria-label="닫기"
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
          <label htmlFor="evt-stt-dt" className="text-sm font-medium text-foreground">
            시작일
          </label>
          <Input
            id="evt-stt-dt"
            type="date"
            max="9999-12-31"
            value={form.stt_dt}
            onChange={(e) => setForm({ ...form, stt_dt: e.target.value })}
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
          {isPbForm && (
            <Caption>
              시작일이 1주차 첫날이에요. 주차는 수요일~화요일로 끊기니 시작일을 수요일로 설정해 주세요.
            </Caption>
          )}
          {sttNotWednesday && sttDay && (
            <Caption className="text-warning">
              선택한 시작일은 {sttDay.format("dddd")}이에요. 수요일이 아니면 주차 경계가 어긋나요.
            </Caption>
          )}
        </div>
        {isPbForm ? (
          // 입력칸이 아니라 계산 결과다 — 손으로 넣으면 12주차 날짜로 끊어 측정 벙 연결이 막히는 일이
          // 실제로 있어서(lib/pb-class.ts `pbEndDtFor`) 아예 입력할 수 없게 했다.
          <div className="flex flex-col gap-2">
            <span id="pb-end-dt-label" className="text-sm font-medium text-foreground">
              종료일 <span className="font-normal text-muted-foreground">(자동)</span>
            </span>
            <output
              htmlFor="evt-stt-dt pb-cfg-totSessCnt"
              aria-labelledby="pb-end-dt-label"
              className="flex h-12 items-center rounded-xl border-[1.5px] border-border bg-secondary/50 px-3"
            >
              {pbEndDt ? (
                <Body>{parseEventTime(pbEndDt).format("YYYY-MM-DD (dd)")}</Body>
              ) : (
                <Body className="text-muted-foreground">시작일을 정하면 자동으로 잡혀요</Body>
              )}
            </output>
            <Caption>
              {pbTotValid
                ? `시작일로부터 ${pbTotSessCnt + 1}주 — 10K 측정 주간까지 자동으로 잡혀요`
                : "총 회차를 입력하면 종료일이 자동으로 잡혀요"}
            </Caption>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="evt-end-dt" className="text-sm font-medium text-foreground">
              종료일
            </label>
            <Input
              id="evt-end-dt"
              type="date"
              max="9999-12-31"
              value={form.end_dt}
              onChange={(e) => setForm({ ...form, end_dt: e.target.value })}
              className="h-12 rounded-xl border-[1.5px] text-[15px]"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">상태</label>
        <Select
          value={form.stts_enm}
          onValueChange={(v) => setForm({ ...form, stts_enm: v as Status })}
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
        {isCreate && <Caption>준비중으로 만들고, 다 갖춰지면 「공개하기」로 회원에게 열어 주세요.</Caption>}
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
