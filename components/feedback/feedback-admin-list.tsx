"use client";

import { useState, useTransition } from "react";

import { dayjs } from "@/lib/dayjs";
import type { FeedbackStatus } from "@/lib/validations/feedback";

import { respondFeedback } from "@/app/actions/feedback/respond-feedback";
import { updateFeedbackStatus } from "@/app/actions/feedback/update-feedback-status";


import { EmptyState } from "@/components/common/empty-state";
import { Body, Caption, Micro, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";

export type AdminFeedbackItem = {
  id: string;
  user_id: string;
  body: string;
  status: FeedbackStatus;
  admin_note: string | null;
  responded_at: string | null;
  created_at: string;
  mem_nm: string;
};

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "접수됨",
  in_review: "확인 중",
  done: "처리 완료",
};

const NEXT_STATUS: Record<FeedbackStatus, FeedbackStatus> = {
  open: "in_review",
  in_review: "done",
  done: "open",
};

const STATUS_CLASS: Record<FeedbackStatus, string> = {
  open: "bg-muted text-muted-foreground",
  in_review: "bg-warning/15 text-warning",
  done: "bg-success/15 text-success",
};

function FeedbackAdminCard({ item }: { item: AdminFeedbackItem }) {
  const [note, setNote] = useState(item.admin_note ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleStatusChange() {
    startTransition(async () => {
      await updateFeedbackStatus(item.id, NEXT_STATUS[item.status]);
    });
  }

  function handleRespond() {
    startTransition(async () => {
      await respondFeedback(item.id, note);
      setIsEditing(false);
    });
  }

  return (
    <CardItem className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Body className="font-medium">{item.mem_nm}</Body>
          <Caption>{dayjs(item.created_at).format("YY.MM.DD HH:mm")}</Caption>
        </div>
        <button
          onClick={handleStatusChange}
          disabled={isPending}
          className={`rounded-full px-2 py-0.5 text-xs font-medium transition-opacity ${STATUS_CLASS[item.status]} ${isPending ? "opacity-50" : ""}`}
        >
          {STATUS_LABEL[item.status]} →
        </button>
      </div>

      <Body>{item.body}</Body>

      {/* 답변 영역 */}
      {isEditing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="답변을 입력하세요"
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>취소</Button>
            <Button size="sm" disabled={isPending} onClick={handleRespond}>
              {isPending ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {item.admin_note && (
            <div className="rounded-lg bg-info/10 px-3 py-2">
              <Micro className="mb-1 text-info">개발자 답변</Micro>
              <Caption className="text-foreground">{item.admin_note}</Caption>
            </div>
          )}
          <Button variant="outline" size="sm" className="self-start" onClick={() => setIsEditing(true)}>
            {item.admin_note ? "답변 수정" : "답변 작성"}
          </Button>
        </div>
      )}
    </CardItem>
  );
}

export function FeedbackAdminList({ items }: { items: AdminFeedbackItem[] }) {
  const open = items.filter((i) => i.status === "open");
  const others = items.filter((i) => i.status !== "open");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SectionLabel>미처리 ({open.length})</SectionLabel>
        {open.length === 0 ? (
          <EmptyState message="미처리 의견이 없습니다." variant="inline" />
        ) : (
          open.map((item) => <FeedbackAdminCard key={item.id} item={item} />)
        )}
      </div>

      {others.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>처리됨 ({others.length})</SectionLabel>
          {others.map((item) => <FeedbackAdminCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}
