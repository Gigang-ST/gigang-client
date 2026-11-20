"use client";

import { ChevronDown, Plus, X } from "lucide-react";
import { useState } from "react";

import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DEFAULT_START_REC_DIST,
  invalidTimeRows,
  RUN_CAREER_CODES,
  RUN_CAREER_LABELS,
  START_REC_DIST_CODES,
  START_REC_DIST_LABELS,
  WKLY_DIST_CODES,
  WKLY_DIST_LABELS,
  type StartInfoDraft,
  type StartRecDistCode,
} from "@/lib/validations/start-info";

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

/**
 * 시작 정보 입력칸(이슈 #719) — 러닝 경력 · 기록 · 주간 거리. 전부 선택이다.
 * 가입 폼 4단계와 `/profile/edit`이 **같은 컴포넌트**를 쓴다(따로 만들면 보기·문구가 갈라진다).
 *
 * 기본 화면은 접혀 있다(`collapsible`) — 30초 안에 끝나는 가입에서 겁먹지 않게.
 * 기록은 10K 칸 하나로 시작하고, 거리를 바꾸거나 `+`로 거리를 더한다.
 * 이 기록은 **본인이 적는 시작점 기준선**이라 대회 기록·랭킹과 무관하다는 걸 칸 아래에 알린다.
 */
export function StartInfoFields({
  value,
  onChange,
  collapsible = false,
  defaultOpen = false,
}: {
  value: StartInfoDraft;
  onChange: (next: StartInfoDraft) => void;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  const bad = new Set(invalidTimeRows(value));
  const used = new Set(value.rows.map((r) => r.distCd));
  const nextDist = START_REC_DIST_CODES.find((c) => !used.has(c));

  const setRow = (i: number, patch: Partial<StartInfoDraft["rows"][number]>) =>
    onChange({ ...value, rows: value.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const body = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>러닝 경력 (선택)</Label>
        <div className="flex flex-wrap gap-2">
          {RUN_CAREER_CODES.map((code) => (
            <Chip
              key={code}
              selected={value.runCareerCd === code}
              onClick={() => onChange({ ...value, runCareerCd: value.runCareerCd === code ? null : code })}
            >
              {RUN_CAREER_LABELS[code]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>평소 주간 거리 (선택)</Label>
        <div className="flex flex-wrap gap-2">
          {WKLY_DIST_CODES.map((code) => (
            <Chip
              key={code}
              selected={value.wklyDistCd === code}
              onClick={() => onChange({ ...value, wklyDistCd: value.wklyDistCd === code ? null : code })}
            >
              {WKLY_DIST_LABELS[code]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>내 기록 (선택)</Label>
        {value.recNone ? null : (
          <div className="flex flex-col gap-2">
            {value.rows.map((row, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Select
                    value={row.distCd}
                    onValueChange={(v) => setRow(i, { distCd: v as StartRecDistCode })}
                  >
                    <SelectTrigger
                      aria-label="기록 거리"
                      className="h-12 w-28 shrink-0 rounded-xl border-[1.5px] text-[15px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {START_REC_DIST_CODES.filter((c) => c === row.distCd || !used.has(c)).map((c) => (
                        <SelectItem key={c} value={c}>
                          {START_REC_DIST_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="text"
                    inputMode="numeric"
                    aria-label={`${START_REC_DIST_LABELS[row.distCd]} 기록`}
                    placeholder="예: 55:30 또는 1:55:30"
                    value={row.timeInput}
                    onChange={(e) => {
                      if (!/^[\d:]*$/.test(e.target.value)) return;
                      setRow(i, { timeInput: e.target.value });
                    }}
                    className="h-12 rounded-xl border-[1.5px] text-[15px]"
                  />
                  {value.rows.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="기록 칸 지우기"
                      onClick={() => onChange({ ...value, rows: value.rows.filter((_, j) => j !== i) })}
                    >
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </div>
                {bad.has(i) ? (
                  <Caption className="text-destructive">
                    분:초(55:30) 또는 시:분:초(1:55:30)로 입력해 주세요. 이 칸은 저장되지 않아요.
                  </Caption>
                ) : null}
              </div>
            ))}
            {nextDist ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                  onChange({
                    ...value,
                    rows: [...value.rows, { distCd: nextDist ?? DEFAULT_START_REC_DIST, timeInput: "" }],
                  })
                }
              >
                <Plus className="size-4" />
                기록 추가
              </Button>
            ) : null}
          </div>
        )}
        <div className="flex">
          <Chip selected={value.recNone} onClick={() => onChange({ ...value, recNone: !value.recNone })}>
            아직 완주 못 해봤어요
          </Chip>
        </div>
        <Caption>직접 적는 참고용 기록이에요. 대회 기록·랭킹에는 반영되지 않아요.</Caption>
      </div>
    </div>
  );

  if (!collapsible) return body;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between rounded-xl border-[1.5px] border-dashed border-border px-4 py-3 text-left"
      >
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold text-foreground">내 러닝 이력 알려주기 (선택)</span>
          <Caption>경력·기록·주간 거리 — 30초면 돼요</Caption>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {/* 접어도 입력값은 상태에 남는다 — 펼쳤다 접는다고 지워지지 않게 hidden 으로만 가린다 */}
      <div hidden={!open}>{body}</div>
    </div>
  );
}
