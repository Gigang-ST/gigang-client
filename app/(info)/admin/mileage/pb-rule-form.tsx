"use client";

import { useState } from "react";

import { toast } from "sonner";

import { savePbRule } from "@/app/actions/admin/manage-pb-class-game";
import { formatSec, parseTimeInput, PB_DEFAULT_RULE, type PbRule } from "@/lib/pb-class-score";

import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { PbRun } from "./use-pb-game";

type PtKey = keyof PbRule["pt"];
type TopKey = "goalMaxSec" | "goalEditUntilWk" | "midWkNo" | "tenKFactor";

/** 입력 도중엔 빈 문자열도 허용해야 해서 폼은 문자열로 든다 — 저장 때 `parseRuleForm`이 숫자로 바꾼다 */
type RuleForm = { top: Record<TopKey, string>; pt: Record<PtKey, string> };

function toForm(rule: PbRule): RuleForm {
  return {
    top: {
      goalMaxSec: formatSec(rule.goalMaxSec),
      goalEditUntilWk: String(rule.goalEditUntilWk),
      midWkNo: String(rule.midWkNo),
      tenKFactor: String(rule.tenKFactor),
    },
    pt: Object.fromEntries(Object.entries(rule.pt).map(([k, v]) => [k, String(v)])) as Record<PtKey, string>,
  };
}

function parseRuleForm(form: RuleForm): { rule: PbRule } | { error: string } {
  const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : Number.NaN);

  const pt = Object.fromEntries(
    (Object.keys(PB_DEFAULT_RULE.pt) as PtKey[]).map((k) => [k, int(form.pt[k])]),
  ) as PbRule["pt"];
  if (Object.values(pt).some(Number.isNaN)) return { error: "점수 칸은 0 이상의 정수로 입력해 주세요" };
  if (pt.hostMinAttd < 1) return { error: "일정 개설 인정 인원은 1명 이상이어야 해요" };

  const goalMaxSec = parseTimeInput(form.top.goalMaxSec);
  if (goalMaxSec === null) return { error: "목표 상한 시간을 mm:ss 형식으로 입력해 주세요 (예: 60:00)" };

  const goalEditUntilWk = int(form.top.goalEditUntilWk);
  const midWkNo = int(form.top.midWkNo);
  if (Number.isNaN(goalEditUntilWk) || Number.isNaN(midWkNo) || goalEditUntilWk < 1 || midWkNo < 1) {
    return { error: "주차는 1 이상의 정수로 입력해 주세요" };
  }

  const tenKFactor = Number(form.top.tenKFactor.trim());
  if (!Number.isFinite(tenKFactor) || tenKFactor <= 1 || tenKFactor > 5) {
    return { error: "5K→10K 환산 계수는 1보다 크고 5 이하여야 해요 (기본 2.085)" };
  }

  return { rule: { goalMaxSec, goalEditUntilWk, midWkNo, tenKFactor, pt } };
}

type FieldDef = { label: string; unit: string; hint?: string };

const PT_FIELDS: ({ key: PtKey } & FieldDef)[] = [
  { key: "attend", label: "공식훈련·측정 출석", unit: "점/회" },
  { key: "join", label: "일정 참여", unit: "점/회", hint: "공식훈련 밖 앱 벙 참석 1회" },
  { key: "host", label: "일정 개설", unit: "점/회" },
  { key: "hostMinAttd", label: "개설 인정 최소 참석", unit: "명", hint: "개설자 포함 이 인원 이상일 때만 개설 점수" },
  { key: "improvePerPct", label: "기록 1% 단축당", unit: "점" },
  { key: "improveMidMax", label: "중간점검 향상 상한", unit: "점" },
  { key: "improveFinalMax", label: "최종 향상 상한", unit: "점" },
  { key: "goal", label: "목표 달성", unit: "점", hint: "측정 10K가 개인 목표 이내" },
  { key: "allAttend", label: "팀 전원 출석 보너스", unit: "점/주", hint: "그 주 등록 팀원 전원 공식훈련 출석" },
];

const TOP_FIELDS: ({ key: TopKey; mode?: "numeric" | "decimal" | "text" } & FieldDef)[] = [
  { key: "goalMaxSec", label: "개인 목표 상한", unit: "mm:ss", mode: "text" },
  { key: "goalEditUntilWk", label: "목표 수정 마지막 주차", unit: "주차", hint: "그 주 화요일 23:59까지 회원이 고칠 수 있어요" },
  { key: "midWkNo", label: "중간점검 주차", unit: "주차" },
  { key: "tenKFactor", label: "5K → 10K 환산 계수", unit: "배", mode: "decimal", hint: "중간·기준 5K에 곱해 10K 예상 기록을 만들어요" },
];

function Field({
  id,
  label,
  unit,
  hint,
  value,
  mode = "numeric",
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  hint?: string;
  value: string;
  mode?: "numeric" | "decimal" | "text";
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode={mode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
        />
        <Caption className="w-12 shrink-0">{unit}</Caption>
      </div>
      {hint && <Caption>{hint}</Caption>}
    </div>
  );
}

/**
 * 배점 설정 — `PbRule` 전 필드.
 * 서버 규칙이 바뀌면(저장·재조회) 폼을 새 값으로 다시 세워야 하므로 부모가 `key`로 리셋한다.
 */
export function PbRuleForm({
  rule,
  evtId,
  run,
  busyKey,
}: {
  rule: PbRule;
  evtId: string;
  run: PbRun;
  busyKey: string | null;
}) {
  const [form, setForm] = useState<RuleForm>(() => toForm(rule));
  const locked = busyKey !== null;
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(rule));

  const handleSave = () => {
    const parsed = parseRuleForm(form);
    if ("error" in parsed) {
      toast.error(parsed.error);
      return;
    }
    void run("rule", () => savePbRule(evtId, parsed.rule), "배점을 저장했어요");
  };

  return (
    <div className="flex flex-col gap-4">
      <CardItem className="flex flex-col gap-4">
        <span className="text-sm font-semibold text-foreground">점수</span>
        {PT_FIELDS.map((f) => (
          <Field
            key={f.key}
            id={`pb-rule-${f.key}`}
            label={f.label}
            unit={f.unit}
            hint={f.hint}
            value={form.pt[f.key]}
            onChange={(v) => setForm((prev) => ({ ...prev, pt: { ...prev.pt, [f.key]: v } }))}
          />
        ))}
      </CardItem>

      <CardItem className="flex flex-col gap-4">
        <span className="text-sm font-semibold text-foreground">기준</span>
        {TOP_FIELDS.map((f) => (
          <Field
            key={f.key}
            id={`pb-rule-${f.key}`}
            label={f.label}
            unit={f.unit}
            hint={f.hint}
            mode={f.mode}
            value={form.top[f.key]}
            onChange={(v) => setForm((prev) => ({ ...prev, top: { ...prev.top, [f.key]: v } }))}
          />
        ))}
      </CardItem>

      <Caption>배점을 바꾸면 점수가 처음부터 다시 계산돼요.</Caption>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="h-[52px] rounded-xl"
          disabled={locked}
          onClick={() => setForm(toForm(PB_DEFAULT_RULE))}
        >
          기본값으로
        </Button>
        <Button
          className="h-[52px] flex-1 rounded-xl text-base font-semibold"
          disabled={locked || !dirty}
          onClick={handleSave}
        >
          {busyKey === "rule" ? "저장 중..." : "저장"}
        </Button>
      </div>
    </div>
  );
}
