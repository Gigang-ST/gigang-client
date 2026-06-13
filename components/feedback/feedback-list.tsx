"use client";

import { dayjs } from "@/lib/dayjs";

import { EmptyState } from "@/components/common/empty-state";
import { SectionHeader } from "@/components/common/section-header";
import { Body, Caption, Micro } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";

export type FeedbackItem = {
  id: string;
  body: string;
  status: "open" | "in_review" | "done";
  admin_note: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<FeedbackItem["status"], string> = {
  open: "접수됨",
  in_review: "확인 중",
  done: "처리 완료",
};

const STATUS_CLASS: Record<FeedbackItem["status"], string> = {
  open: "bg-muted text-muted-foreground",
  in_review: "bg-warning/15 text-warning",
  done: "bg-success/15 text-success",
};

export function FeedbackList({ items }: { items: FeedbackItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader label="내가 보낸 의견" />
      {items.length === 0 ? (
        <EmptyState message="아직 보낸 의견이 없습니다." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <CardItem key={item.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <Caption>{dayjs(item.created_at).format("YY.MM.DD")}</Caption>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[item.status]}`}>
                  {STATUS_LABEL[item.status]}
                </span>
              </div>
              <Body>{item.body}</Body>
              {item.admin_note && (
                <div className="rounded-lg bg-info/10 px-3 py-2">
                  <Micro className="mb-1 text-info">개발자 답변</Micro>
                  <Caption className="text-foreground">{item.admin_note}</Caption>
                </div>
              )}
            </CardItem>
          ))}
        </div>
      )}
    </div>
  );
}
