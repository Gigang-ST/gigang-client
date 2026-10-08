"use client";

import { useState } from "react";

import { AlertTriangle, ChevronDown } from "lucide-react";

import { parseEventTime } from "@/lib/dayjs";
import { wkLabel, weekStartDt } from "@/lib/pb-class";
import { PB_TRN_KINDS, type PbSessPlan } from "@/lib/pb-class-plan";
import type { PbSessDraft } from "@/lib/pb-class-sessions";
import { cn } from "@/lib/utils";

import { Caption } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** 폼 한 줄 — 서버가 준 초안에 「열 것인가」만 얹는다. key는 (종류, 주차)라 줄이 바뀌어도 안정적이다 */
export type SessOpenRow = { key: string; include: boolean; draft: PbSessDraft };

export const rowKeyOf = (d: Pick<PbSessDraft, "sessType" | "wkNo">) => `${d.sessType}:${d.wkNo}`;

export function toRows(drafts: readonly PbSessDraft[]): SessOpenRow[] {
  return drafts.map((draft) => ({ key: rowKeyOf(draft), include: true, draft }));
}

export type RowIssues = {
  /** 막는 오류 — 비어 있으면 안 된다 */
  errors: { title: boolean; date: boolean; time: boolean };
  /** 막지 않는 경고 — 오너가 일부러 요일·날짜를 바꿀 수도 있다 */
  warnings: string[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * 한 줄 검증. 빈 값은 오류(서버가 못 만든다), 요일·주차 어긋남은 경고만 한다 —
 * 공휴일 등으로 목요일에 여는 일이 실제로 있어 막으면 오너가 못 쓴다.
 * 주차 범위는 그 주차 수요일부터 7일이다. 서버가 같은 날짜로 주차를 다시 계산하므로
 * 범위를 벗어나면 연결이 다른 주차로 걸린다는 경고다.
 */
export function rowIssues(row: SessOpenRow, evtSttDt: string): RowIssues {
  const { draft } = row;
  const dateOk = DATE_RE.test(draft.date);
  const warnings: string[] = [];
  if (dateOk) {
    const day = parseEventTime(draft.date);
    if (day.day() !== 3) warnings.push("수요일이 아니에요");
    const start = parseEventTime(weekStartDt(evtSttDt, draft.wkNo));
    // 측정 줄의 주차는 날짜에서 계산된 값이라 범위 비교가 항상 참(무의미) — 훈련만 본다
    if (draft.sessType === "TRAINING" && (day.isBefore(start, "day") || day.isAfter(start.add(6, "day"), "day"))) {
      warnings.push(
        `${wkLabel(draft.wkNo)} 기간(${start.format("M/D")}~${start.add(6, "day").format("M/D")})을 벗어나요`,
      );
    }
  }
  return {
    errors: {
      title: draft.gthrNm.trim() === "",
      date: !dateOk,
      time: !TIME_RE.test(draft.time),
    },
    warnings,
  };
}

/** 포함된 줄 중 오류가 하나라도 있는가 — 제출 버튼을 잠근다 */
export function hasBlockingError(rows: readonly SessOpenRow[], evtSttDt: string): boolean {
  return rows.some((r) => {
    if (!r.include) return false;
    const { errors } = rowIssues(r, evtSttDt);
    return errors.title || errors.date || errors.time;
  });
}

const errCls = "border-destructive focus-visible:ring-destructive/30";

/** 줄 하나 — 순수 표현 컴포넌트(상태는 부모). 설명 펼침만 로컬 상태다 */
export function SessOpenRowItem({
  row,
  evtSttDt,
  plan,
  single = false,
  onChange,
}: {
  row: SessOpenRow;
  evtSttDt: string;
  /** 같은 주차의 훈련표 — 종류 칩에 쓴다. 없으면 칩을 생략 */
  plan?: PbSessPlan;
  /**
   * 주차 하나만 여는 창 — 「열 것인가」 체크가 의미 없고(눌러서 연 창이다), 오너가 바로 고칠 설명이
   * 접혀 있으면 한 번 더 눌러야 하므로 처음부터 펼친다. 같은 줄 컴포넌트를 쓰는 건 필드 정의를 한 곳에 두려는 것.
   */
  single?: boolean;
  onChange: (next: SessOpenRow) => void;
}) {
  const [descOpen, setDescOpen] = useState(single);
  const { draft } = row;
  const { errors, warnings } = rowIssues(row, evtSttDt);
  const set = (patch: Partial<PbSessDraft>) => onChange({ ...row, draft: { ...draft, ...patch } });
  const isMeasure = draft.sessType === "MEASURE";
  const kind = plan ? PB_TRN_KINDS[plan.kindCd] : null;
  const errNames = [errors.title && "제목", errors.date && "날짜", errors.time && "시간"].filter(Boolean);

  return (
    <li className={cn("flex flex-col gap-2 rounded-2xl border border-border p-3", !row.include && "opacity-50")}>
      <div className="flex items-center gap-2">
        {!single && (
          <Checkbox
            checked={row.include}
            onCheckedChange={(v) => onChange({ ...row, include: v === true })}
            aria-label={`${isMeasure ? "10K 측정" : wkLabel(draft.wkNo)} 열기`}
          />
        )}
        <Badge variant="outline">{isMeasure ? "10K 측정" : wkLabel(draft.wkNo)}</Badge>
        {kind && <Badge variant="secondary">{kind.nm}</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={draft.date}
          aria-label="날짜"
          aria-invalid={errors.date}
          className={cn(errors.date && errCls)}
          onChange={(e) => set({ date: e.target.value })}
        />
        <Input
          type="time"
          value={draft.time}
          aria-label="시작 시간"
          aria-invalid={errors.time}
          className={cn(errors.time && errCls)}
          onChange={(e) => set({ time: e.target.value })}
        />
      </div>
      <Input
        value={draft.locTxt}
        placeholder="예: 양재시민의숲 농구장"
        aria-label="장소"
        onChange={(e) => set({ locTxt: e.target.value })}
      />
      <Input
        value={draft.gthrNm}
        placeholder="제목"
        aria-label="제목"
        aria-invalid={errors.title}
        className={cn(errors.title && errCls)}
        onChange={(e) => set({ gthrNm: e.target.value })}
      />

      {errNames.length > 0 && <Caption className="text-destructive">{errNames.join("·")}을 입력해 주세요</Caption>}
      {warnings.map((w) => (
        <div key={w} className="flex items-center gap-1.5">
          <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden />
          <Caption className="text-warning">{w}</Caption>
        </div>
      ))}

      <button
        type="button"
        aria-expanded={descOpen}
        onClick={() => setDescOpen((v) => !v)}
        className="flex min-h-9 items-center gap-1 self-start text-left"
      >
        <ChevronDown className={cn("size-4 transition-transform", descOpen && "rotate-180")} aria-hidden />
        <Caption className="text-foreground">설명 보기</Caption>
      </button>
      {descOpen && (
        <Textarea
          value={draft.descTxt}
          aria-label="설명"
          rows={6}
          onChange={(e) => set({ descTxt: e.target.value })}
        />
      )}
    </li>
  );
}

export function SessOpenRowList({
  rows,
  evtSttDt,
  plans,
  single,
  onChange,
}: {
  rows: readonly SessOpenRow[];
  evtSttDt: string;
  plans: readonly PbSessPlan[];
  single?: boolean;
  onChange: (next: SessOpenRow) => void;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <SessOpenRowItem
          key={row.key}
          row={row}
          evtSttDt={evtSttDt}
          single={single}
          // 측정 줄은 배지가 이미 「10K 측정」이라 훈련 종류 칩을 붙이지 않는다
          plan={row.draft.sessType === "TRAINING" ? plans.find((p) => p.sessNo === row.draft.wkNo) : undefined}
          onChange={onChange}
        />
      ))}
    </ul>
  );
}
