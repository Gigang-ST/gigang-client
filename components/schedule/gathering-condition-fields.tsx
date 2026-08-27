"use client";

import { useState } from "react";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { REQ_ATTD_CNT_MAX, REQ_ATTD_MONTHS_MAX } from "@/lib/validations/gathering";

import { Caption, Micro } from "@/components/common/typography";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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

  /** 빈 칸은 0이 아니라 "안 정함"(null)이다. */
  function num(raw: string): number | null {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
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
