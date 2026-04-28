"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MinusCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { H2, Body, Caption } from "@/components/common/typography";
import {
  refreshUtmbIndexes,
  type RefreshResult,
  type RefreshRow,
} from "@/app/actions/admin/refresh-utmb-indexes";
import type { UtmbRefreshMeta } from "@/app/actions/admin/get-utmb-last-refreshed-at";

type Props = { meta: UtmbRefreshMeta };

const STATUS_LABEL: Record<RefreshRow["status"], string> = {
  updated: "갱신됨",
  unchanged: "변동 없음",
  failed: "실패",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "기록 없음";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UtmbRefreshClient({ meta }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await refreshUtmbIndexes();
        setResult(res);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
      }
    });
  };

  return (
    <div className="flex flex-col gap-7 px-6 pb-6 pt-4">
      <H2>UTMB 인덱스 갱신</H2>

      <CardItem className="flex flex-col gap-2">
        <Caption>대상</Caption>
        <Body className="font-semibold">등록된 {meta.memberCount}명</Body>
        <Caption className="mt-1">마지막 갱신</Caption>
        <Body>{formatDateTime(meta.lastRefreshedAt)}</Body>
      </CardItem>

      <div className="flex flex-col gap-2">
        <Button onClick={handleRun} disabled={pending} size="lg">
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              처리 중...
            </>
          ) : (
            "전체 갱신 시작"
          )}
        </Button>
        {pending && (
          <Caption className="text-center">
            자리를 비우지 마시고 잠시만 기다려 주세요. (~1분 소요)
          </Caption>
        )}
        {error && (
          <Caption className="text-center text-destructive">{error}</Caption>
        )}
      </div>

      {result && (
        <>
          <div className="flex items-center justify-around gap-2">
            <SummaryBadge
              icon={CheckCircle2}
              label="갱신"
              count={result.summary.updated}
              tone="success"
            />
            <SummaryBadge
              icon={MinusCircle}
              label="변동 없음"
              count={result.summary.unchanged}
              tone="muted"
            />
            <SummaryBadge
              icon={XCircle}
              label="실패"
              count={result.summary.failed}
              tone="destructive"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.9fr] gap-2 border-b border-border pb-2">
              <Caption>멤버</Caption>
              <Caption className="text-right">변경 전</Caption>
              <Caption className="text-right">변경 후</Caption>
              <Caption className="text-right">상태</Caption>
            </div>
            {result.rows.map((row) => (
              <ResultRow key={row.memId} row={row} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryBadge({
  icon: Icon,
  label,
  count,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  tone: "success" | "muted" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div className="flex flex-col items-center gap-1">
      <Icon className={`size-5 ${toneClass}`} />
      <Body className={`font-bold ${toneClass}`}>{count}</Body>
      <Caption>{label}</Caption>
    </div>
  );
}

function ResultRow({ row }: { row: RefreshRow }) {
  const variant: "default" | "secondary" | "destructive" =
    row.status === "updated"
      ? "default"
      : row.status === "failed"
        ? "destructive"
        : "secondary";

  const afterClass =
    row.status === "updated"
      ? "font-bold text-foreground"
      : row.status === "failed"
        ? "text-muted-foreground"
        : "text-muted-foreground";

  const updatedBg =
    row.status === "updated"
      ? "bg-success/5"
      : row.status === "failed"
        ? "bg-destructive/5"
        : "";

  return (
    <div
      className={`grid grid-cols-[1.4fr_0.7fr_0.7fr_0.9fr] items-center gap-2 rounded-md py-2 ${updatedBg}`}
    >
      <div className="flex flex-col">
        <Body className="truncate">{row.name}</Body>
        {row.error && (
          <Caption className="truncate text-destructive">{row.error}</Caption>
        )}
      </div>
      <Body className="text-right text-muted-foreground">{row.before}</Body>
      <Body className={`text-right ${afterClass}`}>
        {row.after ?? "—"}
      </Body>
      <div className="flex justify-end">
        <Badge variant={variant}>{STATUS_LABEL[row.status]}</Badge>
      </div>
    </div>
  );
}
