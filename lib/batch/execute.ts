import { createAdminClient } from "@/lib/supabase/admin";

import { batchDuesExemption } from "@/lib/batch/jobs/dues-exemption";
import { batchMileageTitles } from "@/lib/batch/jobs/mileage-titles";
import type { BatchContext, BatchResult } from "@/lib/batch/types";

export type BatchParams = Record<string, string>;

/**
 * job_cd → 핸들러. **새 배치를 추가하면 여기 한 줄이 전부다**(그리고 `batch_job_mst` 행 하나).
 *
 * 핸들러는 `"use server"`가 아닌 `lib/batch/jobs/*`에 둔다 — 서버 액션으로 노출되면
 * 클라이언트가 임의 `teamId`로 직접 부를 수 있다.
 */
const BATCH_ACTION_MAP: Record<
  string,
  (ctx: BatchContext, params: BatchParams) => Promise<BatchResult>
> = {
  // evt_id는 선택이다 — 없으면 핸들러가 기준 월에 걸치는 ACTIVE 시즌을 전부 돈다(크론 경로).
  MILEAGE_TITLE_BATCH: (ctx, params) =>
    batchMileageTitles(ctx, params.evt_id || undefined, params.base_month),
  DUES_EXEMPTION_BATCH: (ctx, params) => batchDuesExemption(ctx, params.base_month),
};

export type ExecuteOutcome = {
  ok: boolean;
  message: string;
  runId: string | null;
  result: BatchResult | null;
};

/**
 * 배치 하나를 실행하고 `batch_run_hist`에 이력을 남긴다.
 *
 * **관리자 수동 실행과 크론 자동 실행이 이 함수 하나를 공유한다.** 크론용 이력 기록을
 * 따로 쓰면 `duration_ms`나 실패 처리 중 한쪽만 고쳐져 어긋나고, 그때부터 관리자 화면의
 * "최근 실행"이 자동 실행을 못 보여 준다(설계 §3.1).
 *
 * 권한은 **호출부가 이미 확인했다** — 관리자 액션은 `withAdmin`, 크론은 `CRON_SECRET`.
 * 이 함수는 권한을 다시 보지 않는다(세션이 없는 크론에서 돌아야 하므로).
 */
export async function executeBatch(
  jobId: string,
  params: BatchParams,
  trigType: "manual" | "auto",
  ctx: BatchContext,
): Promise<ExecuteOutcome> {
  const db = createAdminClient();

  const { data: job } = await db
    .from("batch_job_mst")
    .select("job_id, job_cd, use_yn")
    .eq("job_id", jobId)
    .single();

  if (!job || !job.use_yn) {
    return { ok: false, message: "배치를 찾을 수 없습니다", runId: null, result: null };
  }

  const action = BATCH_ACTION_MAP[job.job_cd];
  if (!action) {
    return {
      ok: false,
      message: `job_cd(${job.job_cd})에 매핑된 액션이 없습니다`,
      runId: null,
      result: null,
    };
  }

  const startedAt = new Date().toISOString();
  const { data: runRow, error: insertError } = await db
    .from("batch_run_hist")
    .insert({
      job_id: jobId,
      trig_type: trigType,
      trig_by: ctx.actorMemId,
      param_json: params,
      status: "running",
      started_at: startedAt,
    })
    .select("run_id")
    .single();

  if (insertError) {
    console.error("[batch] batch_run_hist INSERT 실패", insertError);
    return {
      ok: false,
      message: `이력 생성 실패: ${insertError.message}`,
      runId: null,
      result: null,
    };
  }

  const runId = runRow?.run_id ?? null;
  const startMs = Date.now();
  let status: "success" | "failed" = "success";
  let resultMsg = "";
  let result: BatchResult | null = null;

  try {
    result = await action(ctx, params);
    resultMsg = result.msg;
  } catch (e) {
    status = "failed";
    resultMsg = e instanceof Error ? e.message : "알 수 없는 오류";
  }

  const durationMs = Date.now() - startMs;
  if (runId) {
    await db
      .from("batch_run_hist")
      .update({
        status,
        result_msg: resultMsg,
        // 실패면 남길 구조가 없다(핸들러가 던지고 나왔으므로). 성공분만 구조로 남긴다.
        result_json: result
          ? { metrics: result.metrics, changes: result.changes, warnings: result.warnings }
          : null,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("run_id", runId);
  }

  return { ok: status === "success", message: resultMsg, runId, result };
}
