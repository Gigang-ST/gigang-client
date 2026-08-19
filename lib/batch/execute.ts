import { dayjs } from "@/lib/dayjs";
import { createAdminClient } from "@/lib/supabase/admin";

import { batchDuesExemption } from "@/lib/batch/jobs/dues-exemption";
import { batchMileageTitles } from "@/lib/batch/jobs/mileage-titles";
import { batchTitleGatheringDaily, batchTitleMonthly } from "@/lib/batch/jobs/titles";
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

  // 참석 계열 칭호 — 끝난 지 3일 지난 모임까지 본다(운영진의 노쇼 정리를 기다린다).
  TITLE_GATHERING_DAILY: (ctx) => batchTitleGatheringDaily(ctx),

  // 달이 끝나야 값이 정해지는 칭호(지금은 프로참석러 하나).
  TITLE_MONTHLY: (ctx, params) => batchTitleMonthly(ctx, params.base_month),
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
  /** `jobId`는 이 함수가 채운다 — 호출부는 팀·실행자만 알면 된다. */
  ctx: Omit<BatchContext, "jobId">,
): Promise<ExecuteOutcome> {
  const db = createAdminClient();

  const { data: job } = await db
    .from("batch_job_mst")
    .select("job_id, job_cd, use_yn, team_id")
    .eq("job_id", jobId)
    .single();

  if (!job || !job.use_yn) {
    return { ok: false, message: "배치를 찾을 수 없습니다", runId: null, result: null };
  }

  // ⚠️ **job의 팀과 실행 컨텍스트의 팀이 같은지 서버에서 다시 본다.**
  // 핸들러는 `ctx.teamId`로 데이터를 처리하고 이력은 `jobId`로 남으므로, 검증이 없으면
  // 남의 팀 `job_id`로 **내 팀 데이터를 돌리고 그 팀 이력에 기록**하는 어긋남이 생긴다.
  // `team_id`가 비어 있는 job(팀 미지정)은 예전 행이라 통과시킨다 — 크론은 애초에 걸러낸다.
  if (job.team_id && job.team_id !== ctx.teamId) {
    return { ok: false, message: "다른 팀의 배치는 실행할 수 없습니다", runId: null, result: null };
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

  const startedAt = dayjs().toISOString();
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
    // jobId는 호출부가 몰라도 되게 여기서 채운다 — 핸들러가 자기 지난 실행을 볼 수 있어야 한다.
    result = await action({ ...ctx, jobId }, params);
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
          ? {
              metrics: result.metrics,
              changedCount: result.changedCount,
              changes: result.changes,
              warnings: result.warnings,
            }
          : null,
        finished_at: dayjs().toISOString(),
        duration_ms: durationMs,
      })
      .eq("run_id", runId);
  }

  return { ok: status === "success", message: resultMsg, runId, result };
}
