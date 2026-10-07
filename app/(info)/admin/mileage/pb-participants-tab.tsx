"use client";

import { useMemo, useState } from "react";

import { Check, HandCoins, Pencil, Trash2, Undo2, UserPlus } from "lucide-react";

import {
  addPbParticipant,
  approvePbParticipant,
  deletePbParticipant,
  revokePbApproval,
  updatePbParticipant,
} from "@/app/actions/admin/manage-pb-class";
import { currentWeekNo } from "@/lib/pb-class";
import { nowKST } from "@/lib/dayjs";
import type { PbParticipant } from "@/lib/queries/pb-class";

import { Avatar } from "@/components/common/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { SegmentControl } from "@/components/common/segment-control";
import { StatCard } from "@/components/common/stat-card";
import { Body, Caption, Micro } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import {
  PbParticipantAddDialog,
  PbParticipantEditDialog,
  type PbParticipantEditValues,
} from "./pb-participant-dialogs";
import { usePbBoard } from "./use-pb-board";

type Tab = "pending" | "approved";

const wonText = (n: number) => `${n.toLocaleString()}원`;

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Caption>{label}</Caption>
      <Body className="font-medium">{value}</Body>
    </div>
  );
}

export function PbParticipantsTab({ evtId, teamId }: { evtId: string; teamId: string }) {
  const { board, loading, error, reload, run, busyKey } = usePbBoard(evtId);

  const [tab, setTab] = useState<Tab>("pending");
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PbParticipant | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const participants = board?.participants;
  const excludeMemIds = useMemo(
    () => new Set((participants ?? []).map((p) => p.memId)),
    [participants],
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-2xl" />
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

  const { cfg, totals } = board;
  const list = board.participants.filter((p) => (tab === "pending" ? !p.aprvYn : p.aprvYn));
  const locked = busyKey !== null;

  const handleApprove = (p: PbParticipant) => {
    if (!confirm(`${p.memNm ?? "이름 없음"}님의 입금을 확인하고 승인할까요?`)) return;
    void run(`approve:${p.prtId}`, () => approvePbParticipant(p.prtId), "승인했어요");
  };

  const handleRevoke = (p: PbParticipant) => {
    if (!confirm(`${p.memNm ?? "이름 없음"}님의 승인을 취소할까요?`)) return;
    void run(`revoke:${p.prtId}`, () => revokePbApproval(p.prtId), "승인을 취소했어요");
  };

  const handleDelete = (p: PbParticipant) => {
    const name = p.memNm ?? "이름 없음";
    const msg = p.aprvYn
      ? `${name}님의 참가를 삭제할까요?\n출석·환급 집계에서도 빠져요.`
      : `${name}님의 참가 신청을 삭제할까요?`;
    if (!confirm(msg)) return;
    void run(`delete:${p.prtId}`, () => deletePbParticipant(p.prtId), "삭제했어요");
  };

  const openEdit = (p: PbParticipant) => {
    setEditTarget(p);
    setEditOpen(true);
  };

  const handleEditSubmit = async (prtId: string, values: PbParticipantEditValues) => {
    const ok = await run(`edit:${prtId}`, () => updatePbParticipant(prtId, values), "수정했어요");
    if (ok) setEditOpen(false);
  };

  const handleAddSubmit = async (memId: string, joinWkNo: number) => {
    const ok = await run("add", () => addPbParticipant(evtId, memId, joinWkNo), "참가자를 추가했어요");
    if (ok) setAddOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 합계 — 5개 중 마지막은 두 칸을 쓴다. 금액이 길어 반칸엔 text-xl이 한계다 */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          value={`${totals.aprvCnt}명`}
          valueClassName="text-xl"
          label={`참가 (대기 ${totals.pendingCnt}명)`}
        />
        <StatCard value={wonText(totals.depositSum)} valueClassName="text-xl" label="보증금 합계" />
        <StatCard value={wonText(totals.refundSum)} valueClassName="text-xl" label="환급 예정" />
        <StatCard value={wonText(totals.unrefundedSum)} valueClassName="text-xl" label="미환급 (회식비 풀)" />
        <StatCard
          className="col-span-2"
          value={wonText(totals.entryFeeSum)}
          valueClassName="text-xl"
          label="참가비 합계"
        />
      </div>

      <Button
        variant="outline"
        className="h-11 w-full gap-1.5 rounded-xl"
        onClick={() => setAddOpen(true)}
      >
        <UserPlus className="size-4" />
        참가자 추가
      </Button>

      <SegmentControl
        segments={[
          { value: "pending", label: `대기 ${totals.pendingCnt}` },
          { value: "approved", label: `승인 ${totals.aprvCnt}` },
        ]}
        value={tab}
        onValueChange={setTab}
      />

      <div className="flex flex-col gap-3">
        {list.map((p) => {
          const { summary } = p;
          const rowBusy = busyKey !== null && busyKey.endsWith(`:${p.prtId}`);
          return (
            <CardItem key={p.prtId} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar src={p.avatarUrl} seed={p.memId} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-1.5">
                    <Body className="truncate font-semibold">{p.memNm ?? "이름 없음"}</Body>
                    {summary.late && <Badge variant="outline">늦은 합류</Badge>}
                  </div>
                  <Micro>W{p.joinWkNo} 합류</Micro>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {p.aprvYn && (
                  <>
                    <InfoItem
                      label="출석"
                      value={summary.required === null ? "환급 없음" : `${summary.attdCnt}/${summary.required}회`}
                    />
                    <InfoItem label="환급" value={wonText(summary.refund)} />
                    <InfoItem label="미환급" value={wonText(summary.unrefunded)} />
                  </>
                )}
                <InfoItem label="납부" value={wonText(p.depositAmt + p.entryFeeAmt)} />
                {!p.aprvYn && (
                  <InfoItem
                    label="보증금 · 참가비"
                    value={`${p.depositAmt.toLocaleString()} · ${p.entryFeeAmt.toLocaleString()}`}
                  />
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {p.aprvYn ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-11 gap-1 rounded-lg"
                    disabled={locked || rowBusy}
                    onClick={() => handleRevoke(p)}
                  >
                    <Undo2 className="size-3.5" />
                    승인 취소
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-11 gap-1 rounded-lg"
                    disabled={locked || rowBusy}
                    onClick={() => handleApprove(p)}
                  >
                    <Check className="size-3.5" />
                    승인
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-11 gap-1 rounded-lg"
                  disabled={locked || rowBusy}
                  onClick={() => openEdit(p)}
                >
                  <Pencil className="size-3.5" />
                  수정
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-11 gap-1 rounded-lg text-destructive hover:text-destructive"
                  disabled={locked || rowBusy}
                  onClick={() => handleDelete(p)}
                >
                  <Trash2 className="size-3.5" />
                  삭제
                </Button>
              </div>
            </CardItem>
          );
        })}
      </div>

      {list.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <HandCoins className="size-12 text-muted-foreground/30" />
          <Caption>
            {tab === "pending" ? "승인 대기 중인 참가자가 없습니다" : "승인된 참가자가 없습니다"}
          </Caption>
        </div>
      )}

      <PbParticipantEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        participant={editTarget}
        cfg={cfg}
        busy={busyKey !== null && busyKey.startsWith("edit:")}
        onSubmit={handleEditSubmit}
      />
      <PbParticipantAddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        teamId={teamId}
        cfg={cfg}
        excludeMemIds={excludeMemIds}
        defaultJoinWkNo={currentWeekNo(board.evt.sttDt, nowKST().toISOString())}
        busy={busyKey === "add"}
        onSubmit={handleAddSubmit}
      />
    </div>
  );
}
