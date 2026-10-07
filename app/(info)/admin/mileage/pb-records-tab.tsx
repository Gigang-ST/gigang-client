"use client";

import { useMemo, useState } from "react";

import { Check } from "lucide-react";
import { toast } from "sonner";

import {
  confirmPbRecord,
  setPbGoalByAdmin,
  upsertPbRecords,
} from "@/app/actions/admin/manage-pb-class-game";
import { formatSec, parseTimeInput, type PbRecType } from "@/lib/pb-class-score";
import type { PbGame, PbGameParticipant } from "@/lib/queries/pb-class-game";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { Body, Caption, Micro } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { PbGameLoadError, PbGameSkeleton } from "./pb-game-parts";
import { usePbGame, type PbRun } from "./use-pb-game";

/** 입력 칸 종류 — 목표 하나 + 관리자가 직접 넣는 5K·10K 기록 셋. 대구 10K는 회원이 올린 값을 확인만 한다 */
type Field = "goal" | "BASE_5K" | "MID_5K" | "FINAL_10K";
const REC_FIELDS: Exclude<Field, "goal">[] = ["BASE_5K", "MID_5K", "FINAL_10K"];

const cellKey = (prtId: string, field: Field) => `${prtId}:${field}`;

/** 서버 값 → 입력 칸 문자열. 없으면 빈 칸(= 기록 없음) */
function serverText(p: PbGameParticipant, field: Field): string {
  const sec = field === "goal" ? p.goalSec : (p.recs[field]?.sec ?? null);
  return sec ? formatSec(sec) : "";
}

function serverSec(p: PbGameParticipant, field: Field): number | null {
  return field === "goal" ? p.goalSec : (p.recs[field]?.sec ?? null);
}

export function PbRecordsTab({ evtId }: { evtId: string }) {
  const { game, loading, error, reload, run, busyKey } = usePbGame(evtId);

  if (loading) return <PbGameSkeleton />;
  if (!game) return <PbGameLoadError message={error} onRetry={() => void reload()} />;
  return <RecordsBody game={game} evtId={evtId} run={run} busyKey={busyKey} />;
}

function RecordsBody({
  game,
  evtId,
  run,
  busyKey,
}: {
  game: PbGame;
  evtId: string;
  run: PbRun;
  busyKey: string | null;
}) {
  const locked = busyKey !== null;
  const approved = useMemo(() => game.participants.filter((p) => p.aprvYn), [game.participants]);
  const { rule } = game;

  // 입력 칸은 「고친 칸의 원문 문자열」만 로컬에 든다(서버 값을 복사해 두지 않는다 — 재조회와 어긋나지 않게).
  // 원문을 들어야 "1:2" 처럼 입력 도중의 잘못된 값도 그대로 보이고 빨간 테두리로 알려 줄 수 있다.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const { changes, invalidKeys } = useMemo(() => {
    const byPrt = new Map(approved.map((p) => [p.prtId, p]));
    const changes: { prtId: string; field: Field; sec: number | null }[] = [];
    const invalidKeys = new Set<string>();
    for (const [key, text] of Object.entries(edits)) {
      const [prtId, field] = key.split(":") as [string, Field];
      const p = byPrt.get(prtId);
      if (!p) continue;
      const trimmed = text.trim();
      const sec = trimmed === "" ? null : parseTimeInput(trimmed);
      // 목표는 상한(기본 60분)을 넘기면 회원 화면에서도 못 쓰는 값이라 여기서도 막는다
      const bad = trimmed !== "" && (sec === null || (field === "goal" && sec > rule.goalMaxSec));
      if (bad) {
        invalidKeys.add(key);
        continue;
      }
      if (sec !== serverSec(p, field)) changes.push({ prtId, field, sec });
    }
    return { changes, invalidKeys };
  }, [edits, approved, rule.goalMaxSec]);

  const setCell = (p: PbGameParticipant, field: Field, text: string) => {
    const key = cellKey(p.prtId, field);
    setEdits((prev) => {
      const copy = { ...prev };
      // 서버 값과 같은 문자열로 돌아오면 변경분에서 뺀다
      if (text === serverText(p, field)) delete copy[key];
      else copy[key] = text;
      return copy;
    });
  };

  const handleSave = async () => {
    if (invalidKeys.size > 0) {
      toast.error(`시간 형식이 잘못된 칸이 ${invalidKeys.size}개 있어요. (예: 24:30 · 1:02:03)`);
      return;
    }
    const recRows = changes
      .filter((c): c is { prtId: string; field: Exclude<Field, "goal">; sec: number | null } => c.field !== "goal")
      .map((c) => ({ prtId: c.prtId, recTypeCd: c.field, recSec: c.sec }));
    const goalRows = changes.filter((c) => c.field === "goal");

    const ok = await run(
      "records",
      async () => {
        // 한 번의 저장 안에서 순서대로 — 앞이 실패하면 거기서 멈춰 사유를 그대로 보여 준다.
        // 이미 저장된 쪽은 다시 눌러도 같은 값이라 멱등하다.
        if (recRows.length > 0) {
          const res = await upsertPbRecords(evtId, recRows);
          if (!res.ok) return res;
        }
        for (const g of goalRows) {
          const res = await setPbGoalByAdmin(g.prtId, g.sec);
          if (!res.ok) return res;
        }
        return { ok: true, message: null };
      },
      "기록을 저장했어요",
    );
    if (ok) setEdits({});
  };

  if (approved.length === 0) {
    return <EmptyState variant="card" message="승인된 참가자가 없어요." />;
  }

  const recHead: Record<Exclude<Field, "goal">, string> = {
    BASE_5K: "W1 5K",
    MID_5K: `W${rule.midWkNo} 5K`,
    FINAL_10K: "10K 최종",
  };

  const cellInput = (p: PbGameParticipant, field: Field) => {
    const key = cellKey(p.prtId, field);
    const rec = field === "goal" ? null : p.recs[field];
    const bad = invalidKeys.has(key);
    return (
      <div className="flex flex-col gap-1">
        <Input
          value={edits[key] ?? serverText(p, field)}
          onChange={(e) => setCell(p, field, e.target.value)}
          inputMode="numeric"
          placeholder="mm:ss"
          disabled={locked}
          aria-invalid={bad}
          aria-label={`${p.memNm} ${field === "goal" ? "목표" : recHead[field]}`}
          className={cn(
            "h-10 w-[84px] rounded-lg px-2 text-center",
            bad && "border-destructive focus-visible:ring-destructive",
            edits[key] !== undefined && !bad && "border-primary",
          )}
        />
        {/* 회원이 올려 확인 전인 기록 — 확인해야 점수에 들어간다 */}
        {rec && !rec.cnfm && edits[key] === undefined && (
          <button
            type="button"
            disabled={locked}
            onClick={() =>
              void run(`confirm:${p.prtId}:${field}`, () => confirmPbRecord(p.prtId, field as PbRecType, true), "확인했어요")
            }
            className="inline-flex h-7 items-center justify-center rounded-md bg-warning/10 px-2 disabled:opacity-50"
          >
            <Micro className="font-semibold text-warning">확인 대기 · 확인</Micro>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Caption>
        칸을 비우고 저장하면 그 기록은 지워져요. W2~W{rule.midWkNo - 1} 합류자는 W{rule.midWkNo} 5K가 기준기록이에요.
      </Caption>

      <div className="overflow-x-auto rounded-2xl border-[1.5px] border-border">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="sticky left-0 z-10 w-[120px] bg-secondary px-3 py-2">
                <Micro>이름</Micro>
              </th>
              <th className="px-2 py-2 text-center">
                <Micro>목표</Micro>
              </th>
              {REC_FIELDS.map((f) => (
                <th key={f} className="px-2 py-2 text-center">
                  <Micro>{recHead[f]}</Micro>
                </th>
              ))}
              <th className="px-2 py-2 text-center">
                <Micro>대구 10K</Micro>
              </th>
            </tr>
          </thead>
          <tbody>
            {approved.map((p) => {
              const daegu = p.recs.DAEGU_10K;
              return (
                <tr key={p.prtId} className="border-b border-border last:border-b-0">
                  <td className="sticky left-0 z-10 bg-background px-3 py-2 align-top">
                    <div className="flex items-center gap-1.5">
                      <Avatar src={p.avatarUrl} seed={p.memId} size="xs" />
                      <div className="flex min-w-0 flex-col">
                        <Caption className="truncate font-semibold text-foreground">{p.memNm}</Caption>
                        <Micro>
                          W{p.joinWkNo}
                          {p.late ? " · 팀전 제외" : ""}
                        </Micro>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">{cellInput(p, "goal")}</td>
                  {REC_FIELDS.map((f) => (
                    <td key={f} className="px-2 py-2 align-top">
                      {cellInput(p, f)}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center align-top">
                    {daegu ? (
                      <div className="flex flex-col items-center gap-1">
                        <Body className="font-semibold">{formatSec(daegu.sec)}</Body>
                        {daegu.cnfm ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 rounded-md px-2"
                            disabled={locked}
                            onClick={() =>
                              void run(
                                `confirm:${p.prtId}:DAEGU_10K`,
                                () => confirmPbRecord(p.prtId, "DAEGU_10K", false),
                                "확인을 취소했어요",
                              )
                            }
                          >
                            <Check className="size-3 text-success" aria-hidden />
                            <Micro className="text-foreground">확인됨</Micro>
                          </Button>
                        ) : (
                          <>
                            <Badge variant="outline" className="border-warning px-1.5 py-0">
                              <Micro className="text-warning">확인 대기</Micro>
                            </Badge>
                            <Button
                              size="sm"
                              className="h-7 rounded-md px-2"
                              disabled={locked}
                              onClick={() =>
                                void run(
                                  `confirm:${p.prtId}:DAEGU_10K`,
                                  () => confirmPbRecord(p.prtId, "DAEGU_10K", true),
                                  "확인했어요",
                                )
                              }
                            >
                              <Micro className="text-primary-foreground">확인</Micro>
                            </Button>
                          </>
                        )}
                      </div>
                    ) : (
                      <Micro>—</Micro>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button
        onClick={() => void handleSave()}
        disabled={locked || (changes.length === 0 && invalidKeys.size === 0)}
        className="h-[52px] w-full rounded-xl text-base font-semibold"
      >
        {busyKey === "records" ? "저장 중..." : changes.length > 0 ? `기록 저장 (${changes.length}칸)` : "기록 저장"}
      </Button>
    </div>
  );
}
