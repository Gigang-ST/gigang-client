"use server";

import { withAdmin, withAdminOrThrow } from "@/lib/actions/auth";
import { executeBatch } from "@/lib/batch/execute";
import type { BatchParams } from "@/lib/batch/execute";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { ok: boolean; message: string; runId?: string | null };

/**
 * 관리자 화면의 수동 실행 — `executeBatch`를 감싸는 얇은 래퍼.
 *
 * **주기 체크(`freq_cd`)를 하지 않는다.** 그건 크론이 "자기 차례인지" 정하는 규칙이지
 * job의 실행 조건이 아니다. 여기에 걸면 자동이 한 번 돈 뒤에는 손으로 다시 못 돌리는데,
 * 결과가 이상해서 다시 돌리고 싶을 때가 정확히 그때다(설계 §3.7).
 *
 * 두 번 돌아도 안전하다 — 감면은 같은 달 이미 있으면 스킵, 칭호는 보유 중이면 스킵.
 */
export async function runBatch(jobId: string, params: BatchParams): Promise<ActionResult> {
  return withAdmin(async ({ member }) => {
    // 관리자 실행은 요청 컨텍스트가 있으므로 Host로 팀을 해석한다.
    // (크론은 세션도 Host도 못 믿어 `batch_job_mst.team_id`를 쓴다 — 설계 §3.1)
    const { teamId } = await getRequestTeamContext();

    const outcome = await executeBatch(jobId, params, "manual", {
      teamId,
      actorMemId: member.id ?? null,
    });

    return { ok: outcome.ok, message: outcome.message, runId: outcome.runId };
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
    const { data: jobs } = await db
      .from("batch_job_mst")
      .select("*")
      .eq("use_yn", true)
      .order("crt_at", { ascending: true });
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
