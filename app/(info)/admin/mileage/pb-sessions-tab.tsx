"use client";

import { useState } from "react";

import { AlertTriangle, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";

import {
  linkPbSession,
  listPbLinkCandidates,
  unlinkPbSession,
} from "@/app/actions/admin/manage-pb-class";
import { formatKST } from "@/lib/dayjs";
import { PB_SESS_TYPE_LABEL, type PbSessType } from "@/lib/pb-class";
import type { PbSession } from "@/lib/queries/pb-class";
import { cn } from "@/lib/utils";
import { gthrTypeLabels, type GthrType } from "@/lib/validations/gathering";

import { EmptyState } from "@/components/common/empty-state";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
} from "@/components/common/responsive-drawer";
import { SegmentControl } from "@/components/common/segment-control";
import { Body, Caption } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { usePbBoard } from "./use-pb-board";

/** `listPbLinkCandidates` 한 건 — 프로젝트 기간 안에서 아직 어느 프로젝트에도 안 걸린 벙 */
type Candidate = {
  gthrId: string;
  gthrNm: string;
  sttAt: string;
  gthrTypeEnm: string;
  attdCnt: number;
  wkNo: number;
};

const SESS_TYPE_SEGMENTS: { value: PbSessType; label: string }[] = [
  { value: "TRAINING", label: PB_SESS_TYPE_LABEL.TRAINING },
  { value: "MEASURE", label: PB_SESS_TYPE_LABEL.MEASURE },
];

/** 벙 상태 — 삭제가 시작 시각보다 먼저다(삭제된 벙은 한파 취소라 전원 불참) */
function sessStatus(s: PbSession): { label: string; variant: "destructive" | "secondary" | "outline" } {
  if (s.delYn) return { label: "삭제됨", variant: "destructive" };
  if (!s.held) return { label: "예정", variant: "secondary" };
  return { label: "완료", variant: "outline" };
}

export function PbSessionsTab({ evtId }: { evtId: string }) {
  const { board, loading, error, reload, run, busyKey } = usePbBoard(evtId);

  const [linkOpen, setLinkOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candError, setCandError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [sessType, setSessType] = useState<PbSessType>("TRAINING");

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
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

  const sessions = [...board.sessions].sort(
    (a, b) => a.wkNo - b.wkNo || a.sttAt.localeCompare(b.sttAt),
  );
  const trainingLinked = sessions.filter((s) => s.sessType === "TRAINING").length;
  const measureLinked = sessions.filter((s) => s.sessType === "MEASURE").length;
  const trainingTotal = Math.max(0, board.cfg.totSessCnt - 1);

  const openLinkDialog = async () => {
    setLinkOpen(true);
    setPicked(null);
    setSessType("TRAINING");
    setCandidates(null);
    setCandError(null);
    const res = await listPbLinkCandidates(evtId);
    if (res.ok) setCandidates(res.items);
    else setCandError(res.message ?? "벙 목록을 불러오지 못했어요");
  };

  const handleLink = async () => {
    const target = candidates?.find((c) => c.gthrId === picked);
    if (!target) return;
    // 서버도 막지만(유니크 제약) 사유를 먼저 말해 주면 "왜 안 되는지"를 한 번에 안다
    if (sessType === "MEASURE" && measureLinked >= 1) {
      toast.error("10K 측정은 이미 연결돼 있어요. 기존 연결을 해제한 뒤 다시 걸어 주세요.");
      return;
    }
    if (
      sessType === "TRAINING" &&
      sessions.some((s) => s.sessType === "TRAINING" && s.wkNo === target.wkNo)
    ) {
      toast.error(`W${target.wkNo}에는 이미 공식훈련이 연결돼 있어요.`);
      return;
    }
    const ok = await run("link", () => linkPbSession(evtId, target.gthrId, sessType), "벙을 연결했어요");
    if (ok) setLinkOpen(false);
  };

  const handleUnlink = (s: PbSession) => {
    if (
      !confirm(
        `"${s.gthrNm}" 연결을 해제할까요?\n출석·환급 집계에서 이 회차가 빠지고, 참석 기록은 그대로 남아요.`,
      )
    )
      return;
    void run(`unlink:${s.gthrId}`, () => unlinkPbSession(evtId, s.gthrId), "연결을 해제했어요");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Caption className="text-foreground">
          공식훈련 {trainingLinked}/{trainingTotal} · 측정 {Math.min(measureLinked, 1)}/1
        </Caption>
        <Button onClick={() => void openLinkDialog()} className="h-11 shrink-0 gap-1.5 rounded-xl">
          <Link2 className="size-4" />벙 연결
        </Button>
      </div>

      {sessions.length === 0 ? (
        <EmptyState variant="card" message="연결된 벙이 없어요. 벙 연결로 공식훈련을 지정하세요." />
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((s) => {
            const status = sessStatus(s);
            // 벙 날짜를 바꾸면 저장된 주차와 계산 주차가 갈린다 — 풀고 다시 걸면 서버가 다시 계산해 맞춘다
            const mismatch = s.computedWkNo !== s.wkNo;
            return (
              <CardItem key={s.gthrId} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Badge variant="outline">W{s.wkNo}</Badge>
                    <Badge variant={s.sessType === "MEASURE" ? "default" : "secondary"}>
                      {PB_SESS_TYPE_LABEL[s.sessType]}
                    </Badge>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-11 shrink-0 rounded-lg text-destructive hover:text-destructive"
                    onClick={() => handleUnlink(s)}
                    disabled={busyKey !== null}
                    aria-label={`${s.gthrNm} 연결 해제`}
                  >
                    <Unlink className="size-4" />
                  </Button>
                </div>
                <Body className="truncate font-semibold">{s.gthrNm}</Body>
                <Caption>
                  {formatKST(s.sttAt, "M/D(dd) HH:mm")} · 참석 {s.attdCnt}/{board.totals.aprvCnt}
                </Caption>
                {mismatch && (
                  <div className="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                    <Caption className="text-warning">
                      날짜가 바뀌어 W{s.computedWkNo}에 해당 — 연결을 풀고 다시 걸어주세요
                    </Caption>
                  </div>
                )}
              </CardItem>
            );
          })}
        </div>
      )}

      <ResponsiveDrawer open={linkOpen} onOpenChange={setLinkOpen}>
        <ResponsiveDrawerContent
          dialogClassName="max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden"
          drawerClassName="h-[85dvh] max-h-[85dvh]"
        >
          <ResponsiveDrawerHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
            <ResponsiveDrawerTitle>벙 연결</ResponsiveDrawerTitle>
            <ResponsiveDrawerDescription>
              프로젝트 기간 안에서 아직 연결되지 않은 벙이에요.
            </ResponsiveDrawerDescription>
          </ResponsiveDrawerHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-4">
            <div className="flex flex-col gap-2">
              <Caption className="font-semibold text-foreground">종류</Caption>
              <SegmentControl segments={SESS_TYPE_SEGMENTS} value={sessType} onValueChange={setSessType} />
            </div>

            {candidates === null && !candError && (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            )}
            {candError && <EmptyState variant="card" message={candError} />}
            {candidates?.length === 0 && (
              <EmptyState variant="card" message="연결할 수 있는 벙이 없어요." />
            )}
            {candidates && candidates.length > 0 && (
              <ul className="flex flex-col gap-2">
                {candidates.map((c) => {
                  const selected = picked === c.gthrId;
                  return (
                    <li key={c.gthrId}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPicked(c.gthrId)}
                        className={cn(
                          "flex min-h-11 w-full flex-col gap-1 rounded-xl border-[1.5px] p-3 text-left transition-colors",
                          selected ? "border-primary bg-primary/5" : "border-border",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <Badge variant="outline">W{c.wkNo}</Badge>
                          <Caption>{gthrTypeLabels[c.gthrTypeEnm as GthrType] ?? c.gthrTypeEnm}</Caption>
                        </span>
                        <Body className="truncate font-semibold">{c.gthrNm}</Body>
                        <Caption>
                          {formatKST(c.sttAt, "M/D(dd) HH:mm")} · 참석 {c.attdCnt}명
                        </Caption>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-border p-4">
            <Button
              onClick={() => void handleLink()}
              disabled={!picked || busyKey !== null}
              className="h-[52px] w-full rounded-xl text-base font-semibold"
            >
              {busyKey === "link" ? "연결 중..." : "연결"}
            </Button>
          </div>
        </ResponsiveDrawerContent>
      </ResponsiveDrawer>
    </div>
  );
}
