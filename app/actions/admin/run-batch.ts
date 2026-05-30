"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember, verifyAdmin } from "@/lib/queries/member";
import { batchMileageTitles } from "./batch-mileage-titles";

type BatchParams = Record<string, string>;
type ActionResult = { ok: boolean; message: string; runId: string | null };

/**
 * job_cd → 실제 배치 함수 매핑.
 * 새 배치 추가 시 여기에만 항목 추가하면 UI 코드 변경 불필요.
 */
const BATCH_ACTION_MAP: Record<string, (params: BatchParams) => Promise<string>> = {
  MILEAGE_TITLE_BATCH: (params) => batchMileageTitles(params.base_month),
};

/**
 * 배치 수동 실행.
 * 1. batch_run_hist에 running 상태로 이력 생성
 * 2. 배치 함수 실행
 * 3. 결과(success/failed)로 이력 업데이트
 */
export async function runBatch(jobId: string, params: BatchParams): Promise<ActionResult> {
  await verifyAdmin();
  const { member } = await getCurrentMember();

  const db = createAdminClient();

  // job 정보 조회
  const { data: job } = await db
    .from("batch_job_mst")
    .select("job_id, job_cd, use_yn")
    .eq("job_id", jobId)
    .single();

  if (!job || !job.use_yn) {
    return { ok: false, message: "배치를 찾을 수 없습니다", runId: null };
  }

  const action = BATCH_ACTION_MAP[job.job_cd];
  if (!action) {
    return { ok: false, message: `job_cd(${job.job_cd})에 매핑된 액션이 없습니다`, runId: null };
  }

  // running 이력 INSERT
  const startedAt = new Date().toISOString();
  const { data: runRow } = await db
    .from("batch_run_hist")
    .insert({
      job_id: jobId,
      trig_type: "manual",
      trig_by: member?.id ?? null,
      param_json: params,
      status: "running",
      started_at: startedAt,
    })
    .select("run_id")
    .single();

  const runId = runRow?.run_id ?? null;

  // 배치 실행
  const startMs = Date.now();
  let status: "success" | "failed" = "success";
  let resultMsg = "";

  try {
    resultMsg = await action(params);
  } catch (e) {
    status = "failed";
    resultMsg = e instanceof Error ? e.message : "알 수 없는 오류";
  }

  const durationMs = Date.now() - startMs;

  // 이력 업데이트
  if (runId) {
    await db
      .from("batch_run_hist")
      .update({
        status,
        result_msg: resultMsg,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("run_id", runId);
  }

  return { ok: status === "success", message: resultMsg, runId };
}

/**
 * 배치 목록 조회 (최근 실행 이력 포함).
 */
export async function getBatchJobs() {
  await verifyAdmin();

  const db = createAdminClient();

  const { data: jobs } = await db
    .from("batch_job_mst")
    .select("*")
    .eq("use_yn", true)
    .order("crt_at", { ascending: true });

  if (!jobs?.length) return [];

  // 각 배치의 최근 실행 이력 1건씩 조회
  const jobIds = jobs.map((j) => j.job_id);
  const { data: recentRuns } = await db
    .from("batch_run_hist")
    .select("run_id, job_id, trig_type, status, result_msg, started_at, finished_at, duration_ms")
    .in("job_id", jobIds)
    .order("started_at", { ascending: false });

  // job_id별 최근 1건 추출
  const latestByJobId = new Map<string, typeof recentRuns extends (infer T)[] | null ? T : never>();
  for (const run of recentRuns ?? []) {
    if (!latestByJobId.has(run.job_id)) {
      latestByJobId.set(run.job_id, run);
    }
  }

  return jobs.map((job) => ({
    ...job,
    latestRun: latestByJobId.get(job.job_id) ?? null,
  }));
}

/**
 * 특정 배치의 실행 이력 조회.
 */
export async function getBatchRunHist(jobId: string, limit = 20) {
  await verifyAdmin();

  const db = createAdminClient();

  const { data } = await db
    .from("batch_run_hist")
    .select("*, mem_mst(mem_nm)")
    .eq("job_id", jobId)
    .order("started_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}
