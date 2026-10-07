"use client";

import { useState } from "react";

import { Pencil, Plus, Trash2 } from "lucide-react";

import {
  deletePbSessPlan,
  seedPbSessPlans,
  upsertPbSessPlan,
} from "@/app/actions/admin/manage-pb-class";
import { parseEventTime } from "@/lib/dayjs";
import { weekStartDt, wkLabel } from "@/lib/pb-class";
import { PB_DEFAULT_SESS_PLANS, type PbSessPlan } from "@/lib/pb-class-plan";
import type { PbClassBoard } from "@/lib/queries/pb-class";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/common/empty-state";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { AutoGrowTextarea } from "@/components/common/auto-grow-textarea";
import { RequiredMark } from "@/components/common/required-mark";
import { Body, Caption, Micro } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { usePbBoard } from "./use-pb-board";
import type { PbRun } from "./use-pb-game";

/** 단계 이름 추천 — 기본 훈련표가 쓰는 말. 자유 입력도 되지만 칩으로 고르면 표기가 흩어지지 않는다 */
const PHASE_PRESETS = ["측정", "기초", "점검", "강화", "특화", "마무리"] as const;

/**
 * 회차 번호 → 화면 이름. 마지막 회차(= 총 회차)는 주차가 아니라 「측정」이다.
 * 측정은 13주차일 수도 14주차일 수도 있어(`lib/pb-class.ts` `pbEndDtFor`) 번호를 주차처럼 찍으면 거짓말이 된다.
 */
function sessLabel(sessNo: number, totSessCnt: number): string {
  return sessNo === totSessCnt ? "측정" : wkLabel(sessNo);
}

/**
 * 세션 칸 이름 — 훈련팀을 목표 시간으로 부르므로 세션도 같은 말로 가른다(오너 지시 2026-10-07).
 * 38~50분(A~D)은 같은 세션이고 첫 10K(E)만 개수를 줄여서, 칸은 둘뿐이다. 코드(A~E)는 화면에 안 쓴다.
 */
const MAIN_GROUP_NM = "38~50분 그룹";
const EASY_GROUP_NM = "첫 10K 그룹";

/** n주차의 날짜 범위(수~화) — 훈련표를 달력과 맞춰 보라고 카드에 찍는다 */
function weekRange(evtSttDt: string, wkNo: number): string {
  const start = parseEventTime(weekStartDt(evtSttDt, wkNo));
  return `${start.format("M/D")}~${start.add(6, "day").format("M/D")}`;
}

export function PbSessPlanTab({ evtId }: { evtId: string }) {
  const { board, loading, error, reload, run, busyKey } = usePbBoard(evtId);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex flex-col items-center gap-3">
        <EmptyState variant="card" message={error ?? "불러오지 못했어요"} className="w-full" />
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => void reload()}>
          다시 불러오기
        </Button>
      </div>
    );
  }

  return <PlanBody board={board} evtId={evtId} run={run} busyKey={busyKey} />;
}

/* ------------------------------------------------------------------ */
/* 본문                                                                */
/* ------------------------------------------------------------------ */

/** 로더(`usePbBoard`)를 뺀 본문 — 서버 액션 없이 보드만 넘겨 그려 볼 수 있게 export 한다(렌더 테스트용) */
export function PlanBody({
  board,
  evtId,
  run,
  busyKey,
}: {
  board: PbClassBoard;
  evtId: string;
  run: PbRun;
  busyKey: string | null;
}) {
  const totSessCnt = board.cfg.totSessCnt;
  const locked = busyKey !== null;
  const plans = [...board.sessPlans].sort((a, b) => a.sessNo - b.sessNo);

  // 아직 훈련표가 없는 회차 번호 — 추가 다이얼로그의 선택지. 회차 하나에 훈련 하나라(upsert 키) 이미 쓴 번호는 뺀다.
  const used = new Set(plans.map((p) => p.sessNo));
  const freeSessNos = Array.from({ length: totSessCnt }, (_, i) => i + 1).filter((n) => !used.has(n));

  // 닫을 때 open만 내린다 — 값까지 비우면 닫히는 동안 폼이 「추가」로 깜빡 바뀐다(팀 다이얼로그와 같은 이유)
  const [dialog, setDialog] = useState<{ open: boolean; key: string; target: PbSessPlan | null }>({
    open: false,
    key: "init",
    target: null,
  });
  const [dialogSeq, setDialogSeq] = useState(0);

  const openCreate = () => {
    setDialogSeq((n) => n + 1);
    setDialog({ open: true, key: `create:${dialogSeq + 1}`, target: null });
  };
  const openEdit = (plan: PbSessPlan) => setDialog({ open: true, key: `edit:${plan.sessNo}`, target: plan });

  const handleSubmit = async (plan: PbSessPlan) => {
    const ok = await run(`plan:save:${plan.sessNo}`, () => upsertPbSessPlan(evtId, plan), "훈련을 저장했어요");
    if (ok) setDialog((d) => ({ ...d, open: false }));
  };

  const handleDelete = (plan: PbSessPlan) => {
    const label = sessLabel(plan.sessNo, totSessCnt);
    if (!confirm(`${label} 「${plan.ttl}」 훈련을 삭제할까요?\n회원 「훈련」 탭에서도 사라져요.`)) return;
    void run(`plan:delete:${plan.sessNo}`, () => deletePbSessPlan(evtId, plan.sessNo), "훈련을 삭제했어요");
  };

  // 기본 훈련표는 13회차(공식훈련 12 + 측정 1) 기준이다. 서버가 총 회차가 다르면 거절하므로(몇 번째가 측정인지가
  // 어긋난 채 들어가기 때문) 버튼도 미리 막고 이유를 말해 준다 — 눌러 보고 나서야 알게 하지 않는다.
  const canSeed = totSessCnt === PB_DEFAULT_SESS_PLANS.length;

  const handleSeed = () => {
    if (!confirm(`기본 훈련표 ${PB_DEFAULT_SESS_PLANS.length}회차를 불러올까요?`)) return;
    void run("plan:seed", () => seedPbSessPlans(evtId), "기본 훈련표를 불러왔어요");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Caption className="text-foreground">
            훈련표 {plans.length}/{totSessCnt}회차
          </Caption>
          <Button
            variant="outline"
            className="h-11 shrink-0 gap-1.5 rounded-xl"
            onClick={openCreate}
            // 모든 회차가 찼으면 더 얹을 번호가 없다 — 총 회차를 늘리면 다시 열린다
            disabled={locked || freeSessNos.length === 0}
          >
            <Plus className="size-4" />회차 추가
          </Button>
        </div>
        <Caption>회원 「훈련」 탭에 그대로 보여요. 목적은 &apos;오늘 이걸 왜 하는지&apos;를 한 줄로.</Caption>
      </div>

      {plans.length === 0 ? (
        <EmptyState
          variant="card"
          message="아직 훈련표가 없어요."
          action={
            <div className="flex flex-col items-center gap-2">
              <Button className="h-11 rounded-xl" onClick={handleSeed} disabled={locked || !canSeed}>
                기본 훈련표 불러오기
              </Button>
              {!canSeed && (
                <Caption className="text-warning">
                  기본 훈련표는 {PB_DEFAULT_SESS_PLANS.length}회차용이에요. 총 회차가 {totSessCnt}회라 불러올 수 없어요.
                  「회차 추가」로 회차마다 직접 입력해 주세요.
                </Caption>
              )}
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.sessNo}
              plan={plan}
              label={sessLabel(plan.sessNo, totSessCnt)}
              isMeasure={plan.sessNo === totSessCnt}
              range={plan.sessNo === totSessCnt ? null : weekRange(board.evt.sttDt, plan.sessNo)}
              overTotal={plan.sessNo > totSessCnt}
              totSessCnt={totSessCnt}
              disabled={locked}
              onEdit={() => openEdit(plan)}
              onDelete={() => handleDelete(plan)}
            />
          ))}
        </div>
      )}

      <ResponsiveDrawer open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}>
        <ResponsiveDrawerContent
          dialogClassName="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden"
          drawerClassName="max-h-[85dvh]"
        >
          <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
            <ResponsiveDrawerTitle>{dialog.target ? "훈련 수정" : "회차 추가"}</ResponsiveDrawerTitle>
            <ResponsiveDrawerDescription>
              회원 「훈련」 탭에 이대로 보여요. 단계·제목·세션 내용은 꼭 채워 주세요.
            </ResponsiveDrawerDescription>
          </ResponsiveDrawerHeader>
          <PlanForm
            key={dialog.key}
            target={dialog.target}
            freeSessNos={freeSessNos}
            totSessCnt={totSessCnt}
            busy={busyKey?.startsWith("plan:save:") ?? false}
            onSubmit={(plan) => void handleSubmit(plan)}
          />
        </ResponsiveDrawerContent>
      </ResponsiveDrawer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 카드                                                                */
/* ------------------------------------------------------------------ */

function PlanField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt>
        <Micro>{label}</Micro>
      </dt>
      {/* 세션 내용은 줄바꿈을 넣어 적는 일이 있어 그대로 살린다 */}
      <dd className="whitespace-pre-line">{children}</dd>
    </div>
  );
}

function PlanCard({
  plan,
  label,
  isMeasure,
  range,
  overTotal,
  totSessCnt,
  disabled,
  onEdit,
  onDelete,
}: {
  plan: PbSessPlan;
  label: string;
  isMeasure: boolean;
  range: string | null;
  overTotal: boolean;
  totSessCnt: number;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <CardItem className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={isMeasure ? "default" : "outline"}>{label}</Badge>
            <Badge variant="secondary">{plan.phaseNm}</Badge>
            {range && <Micro>{range}</Micro>}
          </div>
          <Body className="font-semibold">{plan.ttl}</Body>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="icon"
            variant="outline"
            className="size-11 rounded-lg"
            disabled={disabled}
            onClick={onEdit}
            aria-label={`${label} 훈련 수정`}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-11 rounded-lg text-destructive hover:text-destructive"
            disabled={disabled}
            onClick={onDelete}
            aria-label={`${label} 훈련 삭제`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <dl className="flex flex-col gap-2.5">
        <PlanField label={MAIN_GROUP_NM}>
          <Body>{plan.mainTxt}</Body>
        </PlanField>
        <PlanField label={EASY_GROUP_NM}>
          {plan.easyTxt ? <Body>{plan.easyTxt}</Body> : <Caption>{MAIN_GROUP_NM}과 같아요</Caption>}
        </PlanField>
        {/* 목적은 이 화면의 핵심이라 면을 따로 준다 — 세션 내용과 한 덩어리로 읽히면 "왜"가 묻힌다 */}
        <div className="flex flex-col gap-0.5 rounded-xl bg-secondary/60 p-3">
          <dt>
            <Micro>목적</Micro>
          </dt>
          <dd className="whitespace-pre-line">
            <Caption className="text-foreground">{plan.purpTxt}</Caption>
          </dd>
        </div>
        {plan.noteTxt && (
          <PlanField label="비고">
            <Caption className="text-foreground">{plan.noteTxt}</Caption>
          </PlanField>
        )}
      </dl>

      {overTotal && (
        <Caption className="text-warning">
          총 회차({totSessCnt}회)를 넘는 번호예요. 총 회차를 늘리거나 이 훈련을 지워 주세요.
        </Caption>
      )}
    </CardItem>
  );
}

/* ------------------------------------------------------------------ */
/* 폼                                                                  */
/* ------------------------------------------------------------------ */

/** 긴 글 칸의 글자 수 상한 — 서버 스키마(`pbSessPlanSchema`)·DB CHECK와 같은 값. 단계(10)·제목(60)은 칸에 직접 적었다 */
const PLAN_TEXT_MAX = 1000;

/** 입력칸 공통 — 정보 탭의 Input·textarea 규격(12px 반경, 1.5px 테두리, 15px 글자)에 맞춘다 */
const TEXTAREA_CLASS = "rounded-xl border-[1.5px] border-border bg-background px-3 py-3 text-[15px] shadow-none md:text-[15px]";

function FieldLabel({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
      {children}
      {required && <RequiredMark />}
    </label>
  );
}

function PlanForm({
  target,
  freeSessNos,
  totSessCnt,
  busy,
  onSubmit,
}: {
  target: PbSessPlan | null;
  freeSessNos: number[];
  totSessCnt: number;
  busy: boolean;
  onSubmit: (plan: PbSessPlan) => void;
}) {
  const isEdit = target !== null;
  // 새 회차의 기본 번호는 비어 있는 가장 앞 번호, 마지막 번호면 단계도 「측정」으로 미리 채운다
  const firstFree = freeSessNos[0] ?? totSessCnt;
  const [sessNo, setSessNo] = useState(String(target?.sessNo ?? firstFree));
  const [phaseNm, setPhaseNm] = useState(target?.phaseNm ?? (firstFree === totSessCnt ? "측정" : ""));
  const [ttl, setTtl] = useState(target?.ttl ?? "");
  const [mainTxt, setMainTxt] = useState(target?.mainTxt ?? "");
  const [easyTxt, setEasyTxt] = useState(target?.easyTxt ?? "");
  const [purpTxt, setPurpTxt] = useState(target?.purpTxt ?? "");
  const [noteTxt, setNoteTxt] = useState(target?.noteTxt ?? "");

  const sessNoNum = Number(sessNo);
  const valid =
    Number.isInteger(sessNoNum) &&
    sessNoNum >= 1 &&
    phaseNm.trim().length > 0 &&
    ttl.trim().length > 0 &&
    mainTxt.trim().length > 0 &&
    purpTxt.trim().length > 0;

  const handleSubmit = () => {
    onSubmit({
      sessNo: sessNoNum,
      phaseNm: phaseNm.trim(),
      ttl: ttl.trim(),
      mainTxt: mainTxt.trim(),
      // 비우면 「38~50분 그룹과 같음」(null) — 빈 문자열이 저장되면 회원 화면에 빈 첫 10K 칸이 뜬다
      easyTxt: easyTxt.trim() || null,
      purpTxt: purpTxt.trim(),
      noteTxt: noteTxt.trim() || null,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-4">
        <div className="flex flex-col gap-1.5">
          <span id="pb-plan-sess-label" className="text-sm font-medium text-foreground">
            회차
          </span>
          {isEdit ? (
            // 회차 번호가 저장 키라 바꾸면 수정이 아니라 새 훈련이 생긴다 — 고정해 두고 옮기는 법을 알려 준다
            <>
              <div className="flex h-12 items-center rounded-xl border-[1.5px] border-border bg-secondary/50 px-3">
                <Body>{sessLabel(sessNoNum, totSessCnt)}</Body>
              </div>
              <Caption>회차는 바꿀 수 없어요. 다른 회차로 옮기려면 지우고 새로 추가해 주세요.</Caption>
            </>
          ) : (
            <Select value={sessNo} onValueChange={setSessNo}>
              <SelectTrigger
                className="h-12 rounded-xl border-[1.5px] text-[15px]"
                aria-labelledby="pb-plan-sess-label"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {freeSessNos.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {sessLabel(n, totSessCnt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="pb-plan-phase" required>
            단계
          </FieldLabel>
          <Input
            id="pb-plan-phase"
            value={phaseNm}
            maxLength={10}
            onChange={(e) => setPhaseNm(e.target.value)}
            placeholder="예: 기초"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
          <div className="flex flex-wrap gap-1.5">
            {PHASE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={phaseNm.trim() === p}
                onClick={() => setPhaseNm(p)}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border-[1.5px] px-3 transition-colors",
                  phaseNm.trim() === p ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <Caption className={cn(phaseNm.trim() === p && "text-foreground")}>{p}</Caption>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="pb-plan-ttl" required>
            제목
          </FieldLabel>
          <Input
            id="pb-plan-ttl"
            value={ttl}
            maxLength={60}
            onChange={(e) => setTtl(e.target.value)}
            placeholder="예: 400m 반복"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="pb-plan-main" required>
            {MAIN_GROUP_NM} 세션
          </FieldLabel>
          <AutoGrowTextarea
            id="pb-plan-main"
            value={mainTxt}
            minRows={2}
            maxRows={6}
            maxLength={PLAN_TEXT_MAX}
            onChange={(e) => setMainTxt(e.target.value)}
            placeholder="예: 8 × 400m @ P-15초 / 200m 조깅"
            className={TEXTAREA_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="pb-plan-easy">{EASY_GROUP_NM} 세션</FieldLabel>
          <AutoGrowTextarea
            id="pb-plan-easy"
            value={easyTxt}
            minRows={2}
            maxRows={6}
            maxLength={PLAN_TEXT_MAX}
            onChange={(e) => setEasyTxt(e.target.value)}
            placeholder="예: 6 × 400m"
            className={TEXTAREA_CLASS}
          />
          <Caption>같은 세션을 개수만 줄여요. 비우면 {MAIN_GROUP_NM}과 같은 것으로 보여요.</Caption>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="pb-plan-purp" required>
            목적
          </FieldLabel>
          <AutoGrowTextarea
            id="pb-plan-purp"
            value={purpTxt}
            minRows={3}
            maxRows={8}
            maxLength={PLAN_TEXT_MAX}
            onChange={(e) => setPurpTxt(e.target.value)}
            placeholder="이 훈련을 왜 하는지"
            className={TEXTAREA_CLASS}
          />
          <Caption>&apos;오늘 이걸 왜 하는지&apos;를 한 줄로 적어 주세요.</Caption>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="pb-plan-note">비고</FieldLabel>
          <Input
            id="pb-plan-note"
            value={noteTxt}
            maxLength={PLAN_TEXT_MAX}
            onChange={(e) => setNoteTxt(e.target.value)}
            placeholder="예: 게임팀 발표 · 장소 이동"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
          />
          <Caption>행사·장소 변경 같은 한마디. 없으면 비워 두세요.</Caption>
        </div>
      </div>

      <div className="shrink-0 border-t border-border p-4">
        <Button
          disabled={!valid || busy}
          onClick={handleSubmit}
          className="h-[52px] w-full rounded-xl text-base font-semibold"
        >
          {busy ? "저장 중..." : isEdit ? "저장" : "추가"}
        </Button>
      </div>
    </div>
  );
}
