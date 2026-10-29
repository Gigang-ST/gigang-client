"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronDown } from "lucide-react";

import {
  listGatheringExemptionProjects,
  type GatheringExemptionProject,
} from "@/app/actions/gathering/manage-gathering";
import { cn } from "@/lib/utils";
import { REQ_ATTD_CNT_MAX, REQ_ATTD_MONTHS_MAX } from "@/lib/validations/gathering";

import { Caption, Micro } from "@/components/common/typography";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/** Radix Select 는 빈 문자열 값을 못 쓴다 — "면제 없음"(null)을 이 값으로 표현한다. */
const NO_EXEMPTION = "__none__";

/** 끝난 프로젝트를 구분하는 상태값(이미 걸린 면제는 끝나도 목록에 남는다). */
const CLOSED_STATUS = "CLOSED";

/**
 * 모임 참여조건 · 승인제 설정 필드 — **생성 폼과 수정 폼이 공유한다.**
 *
 * 모임 폼은 두 벌이다(`gathering-form-dialog.tsx` 일정탭 다이얼로그 / `gathering-form.tsx`
 * 전용 페이지). 각자 그리면 라벨·범위·문구가 한쪽만 고쳐져 반드시 어긋난다
 * (`PhotoPicker`·`RecordDeleteDialog` 와 같은 이유).
 *
 * react-hook-form 에 묶지 않고 값·onChange 만 받는다 — 두 폼의 `FormValues` 타입이 달라
 * `Control` 을 그대로 넘기면 한쪽이 `any` 로 새기 때문이다. 각 폼은 `useWatch` + `setValue`
 * 로 8줄쯤 배선하면 된다.
 *
 * 설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §6.1
 */

export type GatheringConditionValue = {
  aprv_req_yn: boolean;
  req_attd_cnt: number | null;
  req_attd_months: number | null;
  /** 횟수 조건의 OR 면제 프로젝트 id. 횟수 조건에 딸린 값이라 횟수가 비면 서버가 접는다. */
  exm_evt_id: string | null;
};

type Props = {
  value: GatheringConditionValue;
  onChange: (next: GatheringConditionValue) => void;
  /** 승인제를 끌 수 없는 사유(미처리 신청 있음). 있으면 스위치를 잠그고 사유를 보여준다. */
  approvalLockReason?: string | null;
  disabled?: boolean;
  /**
   * 검증 오류 문구(zod). 이 컴포넌트는 react-hook-form 에 안 묶여 있어 `FormMessage` 가
   * 붙지 않는다 — 이걸 안 그리면 "기간만 입력" 이나 `0` 같은 값에서 **저장 버튼이 아무
   * 반응도 없이 먹통**이 된다(폼은 막았는데 화면은 이유를 말하지 않는다).
   */
  error?: string | null;
};

export function GatheringConditionFields({
  value,
  onChange,
  approvalLockReason,
  disabled,
  error,
}: Props) {
  // 조건의 주인은 **횟수**다. 횟수가 비면 조건 없음, 채우면 조건.
  // 기간은 선택 — 비우면 전체 기간(가입 이후 누적)으로 센다.
  const conditionOn = value.req_attd_cnt != null;
  // 옵션이 하나라도 켜져 있으면 펼친 채로 연다 — 접힌 채면 이미 걸린 조건을 못 보고 지나친다.
  const [open, setOpen] = useState(conditionOn || value.aprv_req_yn);
  // 오류가 나면 접혀 있어도 펼친다 — 안 보이는 칸의 오류는 고칠 방법이 없다.
  const expanded = open || !!error;

  // 면제 프로젝트 목록 — 펼쳐지고 횟수 조건이 켜진 첫 순간에 한 번만 부른다.
  // ref 로 막는다: StrictMode 이중 실행·조건 껐다 켜기로 같은 요청이 반복되지 않게.
  // (언마운트 뒤 setState 는 React 가 무시하므로 취소 플래그는 두지 않는다 — 두면 StrictMode 의
  // 첫 실행 결과가 버려지고 ref 때문에 재요청도 안 해 목록이 영영 비는 함정이 생긴다.)
  const [projects, setProjects] = useState<GatheringExemptionProject[] | null>(null);
  const [projectsFailed, setProjectsFailed] = useState(false);
  const requestedRef = useRef(false);
  const includeEvtId = value.exm_evt_id;
  useEffect(() => {
    if (!expanded || !conditionOn || requestedRef.current) return;
    requestedRef.current = true;
    listGatheringExemptionProjects(includeEvtId)
      .then(setProjects)
      .catch(() => setProjectsFailed(true));
  }, [expanded, conditionOn, includeEvtId]);

  /**
   * 빈 칸은 0이 아니라 "안 정함"(null)이다.
   *
   * ⚠️ `parseInt` 를 쓰지 않는다. `type="number"` 는 `1.5` 를 받는데 `parseInt("1.5")`
   * 는 **1을 조용히 돌려줘** zod 의 `.int()` 검증을 건너뛰고 사용자가 안 쓴 값이 저장된다.
   * `Number()` 로 그대로 넘겨 소수는 검증에서 걸리고 오류 문구가 뜨게 한다.
   */
  function num(raw: string): number | null {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="flex items-center gap-2">
          <Caption className="text-foreground font-medium">참여 조건 · 승인</Caption>
          {(conditionOn || value.aprv_req_yn) && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5">
              <Micro className="text-primary">설정됨</Micro>
            </span>
          )}
        </span>
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
          {/* ── 승인제 ── */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="aprv-req" className="text-[13px] font-normal">
                운영진 승인 후 참가 확정
              </Label>
              <Switch
                id="aprv-req"
                checked={value.aprv_req_yn}
                disabled={disabled || (!!approvalLockReason && value.aprv_req_yn)}
                onCheckedChange={(on) => onChange({ ...value, aprv_req_yn: on })}
              />
            </div>
            <Micro>
              켜면 참석 버튼 대신 <b>참가 신청</b>이 뜨고, 개설자나 운영진이 승인해야 참가가
              확정돼요.
            </Micro>
            {approvalLockReason && value.aprv_req_yn && (
              <Micro className="text-destructive">{approvalLockReason}</Micro>
            )}
          </div>

          {/* ── 참여조건 ──
              스위치를 두지 않는다. 켜는 순간 숫자를 정해 줘야 하는데(예전엔 6/6),
              그 기본값이 곧 "권장값"으로 읽혀 아무도 안 고치고 그대로 나간다.
              **빈칸이 곧 조건 없음**이라 스위치 없이도 뜻이 분명하다. */}
          <div className="flex flex-col gap-1.5 border-t border-border pt-4">
            <Label htmlFor="req-attd-cnt" className="text-[13px] font-normal">
              참석 횟수 조건
            </Label>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Caption className="text-muted-foreground">최근</Caption>
              <Input
                id="req-attd-months"
                type="number"
                inputMode="numeric"
                step={1}
                min={1}
                max={REQ_ATTD_MONTHS_MAX}
                disabled={disabled}
                placeholder="전체"
                aria-label="집계 기간(개월). 비우면 전체 기간"
                className="w-20 text-center text-[13px]"
                value={value.req_attd_months ?? ""}
                onChange={(e) => onChange({ ...value, req_attd_months: num(e.target.value) })}
              />
              <Caption className="text-muted-foreground">개월 동안 모임 참석</Caption>
              <Input
                id="req-attd-cnt"
                type="number"
                inputMode="numeric"
                step={1}
                min={1}
                max={REQ_ATTD_CNT_MAX}
                disabled={disabled}
                placeholder="제한 없음"
                aria-label="필요한 참석 횟수. 비우면 조건 없음"
                className="w-24 text-center text-[13px]"
                value={value.req_attd_cnt ?? ""}
                onChange={(e) => onChange({ ...value, req_attd_cnt: num(e.target.value) })}
              />
              <Caption className="text-muted-foreground">회 이상</Caption>
            </div>

            {/* ── 면제 프로젝트 — 횟수 조건이 있을 때만. 고른 프로젝트 참가자는 횟수와 무관하게 통과(OR) ── */}
            {conditionOn && (
              <ExemptionPicker
                projects={projects}
                failed={projectsFailed}
                selected={value.exm_evt_id}
                disabled={disabled}
                onSelect={(id) => onChange({ ...value, exm_evt_id: id })}
              />
            )}

            {error ? (
              <Micro className="text-destructive">{error}</Micro>
            ) : conditionOn ? (
              <Micro>
                조건을 못 채운 사람은 신청 버튼이 잠기고, 예외로 넣어야 할 사람은 운영진이
                모임 관리에서 직접 추가할 수 있어요.
              </Micro>
            ) : (
              <Micro>횟수를 비우면 조건 없이 누구나 참석할 수 있어요.</Micro>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "또는 이 프로젝트 참가자" 고르기. 프로젝트가 없으면(이미 걸린 값도 없으면) 아예 안 그린다. */
function ExemptionPicker({
  projects,
  failed,
  selected,
  disabled,
  onSelect,
}: {
  projects: GatheringExemptionProject[] | null;
  failed: boolean;
  selected: string | null;
  disabled?: boolean;
  onSelect: (evtId: string | null) => void;
}) {
  if (failed) {
    return <Micro className="text-destructive">프로젝트 목록을 불러오지 못했어요.</Micro>;
  }
  // 불러오는 중이거나 고를 프로젝트가 없으면 그리지 않는다(이미 건 값은 서버가 목록에 포함시켜 준다)
  if (!projects || projects.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <Label htmlFor="exm-evt" className="text-[13px] font-normal">
        또는 이 프로젝트 참가자
      </Label>
      <Select
        value={selected ?? NO_EXEMPTION}
        onValueChange={(v) => onSelect(v === NO_EXEMPTION ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger id="exm-evt" className="text-[13px]">
          <SelectValue placeholder="면제 없음" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_EXEMPTION}>면제 없음</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.evt_id} value={p.evt_id}>
              {p.evt_nm}
              {p.stts_enm === CLOSED_STATUS ? " (종료)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Micro>고른 프로젝트에 승인된 참가자는 참석 횟수와 상관없이 신청할 수 있어요.</Micro>
    </div>
  );
}
