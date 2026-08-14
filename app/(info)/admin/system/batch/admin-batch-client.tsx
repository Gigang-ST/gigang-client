"use client";

import { useState, useEffect, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Play, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

import { scheduleLabel } from "@/lib/batch/schedule";
import {
  didChange,
  findComparableRun,
  metricDeltas,
  parseStoredBatchResult,
} from "@/lib/batch/types";
import { currentMonthKST, formatKSTDateTime, prevMonthStr, todayKST } from "@/lib/dayjs";

import { runBatch, getBatchRunHist, getActiveEvents } from "@/app/actions/admin/run-batch";

import { SectionHeader } from "@/components/common/section-header";
import { Body, Caption, Micro } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";



export type ParamField = {
  key: string;
  label: string;
  type: "month" | "date" | "text" | "number" | "boolean" | "evt_select";
  required: boolean;
  default?: string | "prev_month" | "today";
  description?: string;
};

type EventOption = { evt_id: string; evt_nm: string };

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
  freq_cd: string | null;
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
  result_json: unknown;
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

/**
 * 성공 배지 — **변화가 0이면 회색 "변화 없음"으로 갈린다.**
 *
 * 대상이 없어 아무것도 안 한 실행과 5명에게 감면을 준 실행이 같은 초록 배지면,
 * 매달 훑어볼 때 이상 징후가 안 보인다. `status` enum은 건드리지 않는다 —
 * "변화 없음"은 별도 상태가 아니라 *변화 건수가 0인 success*다(설계 §4.3).
 */
function StatusBadge({ status, changed }: { status: string; changed?: boolean }) {
  if (status === "success") {
    if (changed === false) return <Badge variant="outline" className="text-muted-foreground">변화 없음</Badge>;
    return <Badge className="bg-success/15 text-success border-0">성공</Badge>;
  }
  if (status === "failed") return <Badge variant="destructive">실패</Badge>;
  if (status === "running") return <Badge className="bg-warning/15 text-warning border-0">실행중</Badge>;
  return null;
}

/** 지표 칩 — 배치마다 키가 다르므로 **키를 모른 채** 그린다(설계 §4.2). */
function MetricChips({
  metrics,
  deltas,
}: {
  metrics: { label: string; value: number }[];
  deltas: Record<string, number>;
}) {
  if (!metrics.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {metrics.map(({ label, value }) => {
        const d = deltas[label];
        return (
          <span
            key={label}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5"
          >
            <Micro className="text-muted-foreground">{label}</Micro>
            <Micro className="text-foreground font-semibold">{value}</Micro>
            {d !== undefined && (
              // 직전 성공 실행 대비. 월 배치에선 이게 곧 "지난달 대비"다.
              <Micro className={d > 0 ? "text-success" : "text-destructive"}>
                {d > 0 ? `▲${d}` : `▼${Math.abs(d)}`}
              </Micro>
            )}
          </span>
        );
      })}
    </div>
  );
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


export function AdminBatchClient({ initialJobs }: { initialJobs: BatchJob[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<BatchJob[]>(initialJobs);

  // router.refresh() 후 서버에서 새 initialJobs가 오면 동기화
  useEffect(() => { setJobs(initialJobs); }, [initialJobs]); // eslint-disable-line react-hooks/set-state-in-effect
  const [selectedJob, setSelectedJob] = useState<BatchJob | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  /** 변경 목록을 펼친 실행 — 한 번에 하나만 편다(이력이 길어 여러 개면 못 읽는다). */
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [histMap, setHistMap] = useState<Record<string, HistRow[]>>({});
  const [histLoading, setHistLoading] = useState<string | null>(null);
  const [eventOptions, setEventOptions] = useState<EventOption[]>([]);

  async function openSheet(job: BatchJob) {
    const schema = job.param_schema_json ?? [];
    const defaults: Record<string, string> = {};
    for (const field of schema) {
      defaults[field.key] = resolveDefault(field.default as string | undefined);
    }
    // evt_select 타입 필드가 있으면 이벤트 목록 로드
    if (schema.some((f) => f.type === "evt_select")) {
      const events = await getActiveEvents();
      setEventOptions(events);
      // 이벤트가 1개면 자동 선택
      if (events.length === 1) defaults["evt_id"] = events[0].evt_id;
    }
    setParams(defaults);
    setSelectedJob(job);
    setSheetOpen(true);
  }

  function handleRun() {
    if (!selectedJob) return;

    // 출석 회비 감면 배치: 당월·미래월은 확정 불가(전월 이하만). 버튼 단에서 미리 차단.
    if (selectedJob.job_cd === "DUES_EXEMPTION_BATCH") {
      const ym = (params.base_month ?? "").slice(0, 7);
      const curYm = currentMonthKST().slice(0, 7);
      if (ym && ym >= curYm) {
        toast.error("진행 중이거나 미래인 달은 확정할 수 없습니다. 마감된 전월 이하만 선택하세요.");
        return;
      }
    }

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
          <Caption className="text-muted-foreground">
            · 스케줄이 있는 배치는 자동 실행됩니다
          </Caption>
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
                    <Caption>{scheduleLabel(job.freq_cd)}</Caption>
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
                      {(histMap[job.job_id] ?? []).map((run, idx, arr) => {
                        const parsed = parseStoredBatchResult(run.result_json);
                        // 비교 상대는 **파라미터가 다른** 지난 회차다(같은 달 재실행이 아니라).
                        // 목록이 최신순이라 나보다 뒤(오래된 쪽)에서 찾는다.
                        const prev = findComparableRun(run, arr.slice(idx + 1));
                        const deltas = parsed
                          ? metricDeltas(parsed.metrics, prev?.metrics ?? null)
                          : {};
                        // 변화 여부는 핸들러가 선언한 changedCount가 정본이다.
                        // changes 길이로 추측하면 그걸 안 채우는 배치(마일리지런)가
                        // 칭호를 부여하고도 "변화 없음"으로 나온다.
                        const changed = parsed ? didChange(parsed) : undefined;

                        return (
                          <div key={run.run_id} className="flex flex-col gap-1.5 px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <TrigTypeBadge type={run.trig_type} />
                                <StatusBadge status={run.status} changed={changed} />
                              </div>
                              <Caption>{formatDate(run.started_at)}</Caption>
                            </div>
                            {run.param_json && Object.keys(run.param_json).length > 0 && (
                              <Micro className="text-muted-foreground">
                                파라미터: {Object.entries(run.param_json).map(([k, v]) => `${k}=${v}`).join(", ")}
                              </Micro>
                            )}
                            {parsed && <MetricChips metrics={parsed.metrics} deltas={deltas} />}
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

                            {parsed && parsed.warnings.length > 0 && (
                              <div className="flex flex-col gap-0.5 rounded-md bg-warning/10 px-2 py-1.5">
                                {parsed.warnings.map((w, i) => (
                                  <Micro key={i} className="text-warning">{w}</Micro>
                                ))}
                              </div>
                            )}

                            {/* 누구에게 무엇이 바뀌었는지 — 접어 두고 필요할 때 편다 */}
                            {parsed && parsed.changes.length > 0 && (
                              <button
                                onClick={() =>
                                  setExpandedRunId((cur) => (cur === run.run_id ? null : run.run_id))
                                }
                                className="flex items-center gap-1 self-start text-muted-foreground"
                              >
                                <Micro>변경 {parsed.changes.length}건</Micro>
                                {expandedRunId === run.run_id
                                  ? <ChevronUp className="h-3 w-3" />
                                  : <ChevronDown className="h-3 w-3" />}
                              </button>
                            )}
                            {parsed && expandedRunId === run.run_id && (
                              <div className="flex flex-col gap-1 rounded-md bg-muted px-2 py-1.5">
                                {parsed.changes.map((c, i) => (
                                  <div key={i} className="flex items-baseline gap-2">
                                    <Micro className="text-foreground font-semibold shrink-0">{c.memNm}</Micro>
                                    <Micro className="text-muted-foreground">{c.what}</Micro>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
                {field.type === "evt_select" ? (
                  <Select
                    value={params[field.key] ?? ""}
                    onValueChange={(v) => setParams((prev) => ({ ...prev, [field.key]: v }))}
                  >
                    <SelectTrigger className="h-10 rounded-lg">
                      <SelectValue placeholder="이벤트 선택" />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {eventOptions.map((e) => (
                        <SelectItem key={e.evt_id} value={e.evt_id}>
                          {e.evt_nm}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.key}
                    type={field.type === "month" ? "month" : field.type === "date" ? "date" : "text"}
                    value={params[field.key] ?? ""}
                    onChange={(e) => setParams((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.description}
                  />
                )}
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
