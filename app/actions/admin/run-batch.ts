"use server";

import { withAdmin, withAdminOrThrow } from "@/lib/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { batchDuesExemption } from "./batch-dues-exemption";
import { batchMileageTitles } from "./batch-mileage-titles";

type BatchParams = Record<string, string>;
type ActionResult = { ok: boolean; message: string; runId?: string | null };

const BATCH_ACTION_MAP: Record<string, (params: BatchParams) => Promise<string>> = {
  MILEAGE_TITLE_BATCH: (params) => {
    if (!params.evt_id) throw new Error("evt_id 파라미터가 필요합니다");
    return batchMileageTitles(params.evt_id, params.base_month);
  },
  DUES_EXEMPTION_BATCH: (params) => batchDuesExemption(params.base_month),
};

export async function runBatch(jobId: string, params: BatchParams): Promise<ActionResult> {
  return withAdmin(async ({ member }) => {
    const db = createAdminClient();

    const { data: job } = await db
      .from("batch_job_mst")
      .select("job_id, job_cd, use_yn")
      .eq("job_id", jobId)
      .single();

    if (!job || !job.use_yn) return { ok: false, message: "배치를 찾을 수 없습니다", runId: null };

    const action = BATCH_ACTION_MAP[job.job_cd];
    if (!action) return { ok: false, message: `job_cd(${job.job_cd})에 매핑된 액션이 없습니다`, runId: null };

    const startedAt = new Date().toISOString();
    const { data: runRow, error: insertError } = await db
      .from("batch_run_hist")
      .insert({
        job_id: jobId,
        trig_type: "manual",
        trig_by: member.id ?? null,
        param_json: params,
        status: "running",
        started_at: startedAt,
      })
      .select("run_id")
      .single();

    if (insertError) {
      console.error("[run-batch] batch_run_hist INSERT 실패", insertError);
      return { ok: false, message: `이력 생성 실패: ${insertError.message}`, runId: null };
    }

    const runId = runRow?.run_id ?? null;
    const startMs = Date.now();
    let status: "success" | "failed" = "success";
    let resultMsg = "";

    try { resultMsg = await action(params); }
    catch (e) { status = "failed"; resultMsg = e instanceof Error ? e.message : "알 수 없는 오류"; }

    const durationMs = Date.now() - startMs;
    if (runId) {
      await db
        .from("batch_run_hist")
        .update({ status, result_msg: resultMsg, finished_at: new Date().toISOString(), duration_ms: durationMs })
        .eq("run_id", runId);
    }

    return { ok: status === "success", message: resultMsg, runId };
  });
}

export async function getActiveEvents() {
  return withAdminOrThrow(async () => {
    const db = createAdminClient();
    const { data } = await db
      .from("evt_team_mst")
      .select("evt_id, evt_nm")
      .eq("stts_enm", "ACTIVE")
      .order("stt_dt", { ascending: false });
    return (data ?? []) as { evt_id: string; evt_nm: string }[];
  });
}

export async function getBatchJobs() {
  return withAdminOrThrow(async () => {
    const db = createAdminClient();
    const { data: jobs } = await db.from("batch_job_mst").select("*").eq("use_yn", true).order("crt_at", { ascending: true });
    if (!jobs?.length) return [];

    const jobIds = jobs.map((j) => j.job_id);
    const { data: recentRuns } = await db
      .from("batch_run_hist")
      .select("run_id, job_id, trig_type, status, result_msg, started_at, finished_at, duration_ms")
      .in("job_id", jobIds)
      .order("started_at", { ascending: false });

    const latestByJobId = new Map<string, typeof recentRuns extends (infer T)[] | null ? T : never>();
    for (const run of recentRuns ?? []) {
      if (!latestByJobId.has(run.job_id)) latestByJobId.set(run.job_id, run);
    }

    return jobs.map((job) => ({ ...job, latestRun: latestByJobId.get(job.job_id) ?? null }));
  });
}

export async function getBatchRunHist(jobId: string, limit = 20) {
  return withAdminOrThrow(async () => {
    const db = createAdminClient();
    const { data } = await db
      .from("batch_run_hist")
      .select("*, mem_mst(mem_nm)")
      .eq("job_id", jobId)
      .order("started_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  });
}
