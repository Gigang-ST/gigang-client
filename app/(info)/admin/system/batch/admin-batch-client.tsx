"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { currentMonthKST, formatKSTDateTime, prevMonthStr, todayKST } from "@/lib/dayjs";
import { Play, Clock, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardItem } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { Body, Caption, Micro } from "@/components/common/typography";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { runBatch, getBatchRunHist } from "@/app/actions/admin/run-batch";
import { toast } from "sonner";

export type ParamField = {
  key: string;
  label: string;
  type: "month" | "date" | "text" | "number" | "boolean";
  required: boolean;
  default?: string | "prev_month" | "today";
  description?: string;
};

type LatestRun = {
  run_id: string;
  job_id: string;
  trig_type: string;
  status: string;
  result_msg: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
} | null;

type BatchJob = {
  job_id: string;
  job_nm: string;
  job_cd: string;
  job_desc: string | null;
  cron_expr: string | null;
  param_schema_json: ParamField[] | null;
  use_yn: boolean;
  crt_at: string;
  latestRun: LatestRun;
};

type HistRow = {
  run_id: string;
  trig_type: string;
  status: string;
  result_msg: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  param_json: Record<string, string> | null;
  mem_mst: { mem_nm: string } | null;
};

function resolveDefault(def?: string): string {
  if (def === "prev_month") return prevMonthStr(currentMonthKST()).slice(0, 7);
  if (def === "today") return todayKST();
  return def ?? "";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return <Badge className="bg-success/15 text-success border-0">성공</Badge>;
  if (status === "failed") return <Badge variant="destructive">실패</Badge>;
  if (status === "running") return <Badge className="bg-warning/15 text-warning border-0">실행중</Badge>;
  return null;
}

function TrigTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="text-xs">
      {type === "manual" ? "수시" : "자동"}
    </Badge>
  );
}

function formatDuration(ms: number | null) {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(dt: string | null) {
  if (!dt) return "-";
  return formatKSTDateTime(dt);
}

function cronLabel(expr: string | null) {
  if (!expr) return "수동만";
  if (expr === "0 15 1 * *") return "매월 1일 자정 (KST)";
  return expr;
}

export function AdminBatchClient({ initialJobs }: { initialJobs: BatchJob[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<BatchJob[]>(initialJobs);

  // router.refresh() 후 서버에서 새 initialJobs가 오면 동기화
  useEffect(() => { setJobs(initialJobs); }, [initialJobs]);
  const [selectedJob, setSelectedJob] = useState<BatchJob | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [histMap, setHistMap] = useState<Record<string, HistRow[]>>({});
  const [histLoading, setHistLoading] = useState<string | null>(null);

  function openSheet(job: BatchJob) {
    const schema = job.param_schema_json ?? [];
    const defaults: Record<string, string> = {};
    for (const field of schema) {
      defaults[field.key] = resolveDefault(field.default as string | undefined);
    }
    setParams(defaults);
    setSelectedJob(job);
    setSheetOpen(true);
  }

  function handleRun() {
    if (!selectedJob) return;
    startTransition(async () => {
      const result = await runBatch(selectedJob.job_id, params);
      setSheetOpen(false);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      // 이력 캐시 초기화 후 열려있는 패널 즉시 재조회
      setHistMap({});
      if (expandedJobId) {
        setHistLoading(expandedJobId);
        const rows = await getBatchRunHist(expandedJobId);
        setHistMap({ [expandedJobId]: rows as HistRow[] });
        setHistLoading(null);
      }
      router.refresh();
    });
  }

  async function toggleHist(jobId: string) {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(jobId);
    if (!histMap[jobId]) {
      setHistLoading(jobId);
      const rows = await getBatchRunHist(jobId);
      setHistMap((prev) => ({ ...prev, [jobId]: rows as HistRow[] }));
      setHistLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-7 px-6 pb-6 pt-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <SectionHeader label="배치 목록" />
          <Caption className="text-muted-foreground">· 자동 스케줄 배치 미구현</Caption>
        </div>
        <div className="flex flex-col gap-3">
          {jobs.map((job) => (
            <div key={job.job_id} className="flex flex-col gap-0">
              <CardItem variant="outlined" className="flex flex-col gap-3 p-4">
                {/* 배치 기본 정보 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <Body className="font-semibold">{job.job_nm}</Body>
                    {job.job_desc && (
                      <Caption className="text-muted-foreground">{job.job_desc}</Caption>
                    )}
                  </div>
                  <Button size="sm" onClick={() => openSheet(job)} className="shrink-0 gap-1.5">
                    <Play className="h-3.5 w-3.5" />
                    즉시 실행
                  </Button>
                </div>

                {/* cron / 최근 실행 정보 */}
                <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                  <div className="flex items-center justify-between">
                    <Caption className="text-muted-foreground">스케줄</Caption>
                    <Caption>{cronLabel(job.cron_expr)}</Caption>
                  </div>
                  {job.latestRun ? (
                    <>
                      <div className="flex items-center justify-between">
                        <Caption className="text-muted-foreground">최근 실행</Caption>
                        <div className="flex items-center gap-2">
                          <TrigTypeBadge type={job.latestRun.trig_type} />
                          <Caption>{formatDate(job.latestRun.started_at)}</Caption>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Caption className="text-muted-foreground">최근 상태</Caption>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={job.latestRun.status} />
                          <Caption>{formatDuration(job.latestRun.duration_ms)}</Caption>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <Caption className="text-muted-foreground">최근 실행</Caption>
                      <Caption>-</Caption>
                    </div>
                  )}
                </div>

                {/* 이력 토글 버튼 */}
                <button
                  onClick={() => toggleHist(job.job_id)}
                  className="flex items-center gap-1 text-muted-foreground self-start"
                >
                  <Micro>실행 이력</Micro>
                  {expandedJobId === job.job_id
                    ? <ChevronUp className="h-3 w-3" />
                    : <ChevronDown className="h-3 w-3" />
                  }
                </button>
              </CardItem>

              {/* 이력 패널 */}
              {expandedJobId === job.job_id && (
                <CardItem variant="outlined" className="flex flex-col gap-0 rounded-t-none border-t-0 p-0 overflow-hidden">
                  {histLoading === job.job_id ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (histMap[job.job_id] ?? []).length === 0 ? (
                    <div className="py-6 text-center">
                      <Caption>실행 이력이 없습니다</Caption>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {(histMap[job.job_id] ?? []).map((run) => (
                        <div key={run.run_id} className="flex flex-col gap-1.5 px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TrigTypeBadge type={run.trig_type} />
                              <StatusBadge status={run.status} />
                            </div>
                            <Caption>{formatDate(run.started_at)}</Caption>
                          </div>
                          {run.param_json && Object.keys(run.param_json).length > 0 && (
                            <Micro className="text-muted-foreground">
                              파라미터: {Object.entries(run.param_json).map(([k, v]) => `${k}=${v}`).join(", ")}
                            </Micro>
                          )}
                          <div className="flex items-center justify-between">
                            {run.result_msg && (
                              <Micro className="text-muted-foreground flex-1 min-w-0 truncate pr-2">
                                {run.result_msg}
                              </Micro>
                            )}
                            <Micro className="text-muted-foreground shrink-0">
                              {formatDuration(run.duration_ms)}
                            </Micro>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardItem>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 즉시 실행 Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="mb-4">
            <SheetTitle>{selectedJob?.job_nm} 실행</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4">
            {(selectedJob?.param_schema_json ?? []).map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  id={field.key}
                  type={field.type === "month" ? "month" : field.type === "date" ? "date" : "text"}
                  value={params[field.key] ?? ""}
                  onChange={(e) => setParams((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.description}
                />
                {field.description && (
                  <Caption className="text-muted-foreground">{field.description}</Caption>
                )}
              </div>
            ))}

            {(selectedJob?.param_schema_json ?? []).length === 0 && (
              <Caption className="text-muted-foreground">파라미터가 없습니다.</Caption>
            )}
          </div>

          <SheetFooter className="mt-6">
            <Button
              className="w-full gap-2"
              onClick={handleRun}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  실행 중...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  실행
                </>
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
