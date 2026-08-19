import { NextResponse } from "next/server";

import { executeBatch } from "@/lib/batch/execute";
import {
  buildAutoParams,
  hasLiveRun,
  hasSucceededThisCycle,
  staleRunningIds,
} from "@/lib/batch/schedule";
import type { FreqCd, ParamField } from "@/lib/batch/schedule";
import { dayjs } from "@/lib/dayjs";
import { env } from "@/lib/env";
import { insertNoti } from "@/lib/notifications/insert-noti";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 자동 배치 크론 — **크론 하나가 `batch_job_mst`를 읽어 N개 배치를 디스패치한다.**
 * 설계: docs/design/2026-08-14-배치-자동화.md
 *
 * 배치마다 크론을 파지 않는 이유: Vercel Hobby는 크론이 **2개**가 끝인데 이미 다 쓰고 있었다.
 * 레지스트리가 있으므로 진입점 하나가 목록을 읽으면 배치가 늘어도 크론은 그대로다.
 *
 * 이 라우트가 `keep-alive` 자리를 대신한다 — 매일 `batch_job_mst`를 조회하므로
 * **Supabase 슬립 방지 역할을 그대로 흡수**한다(별도 쿼리용 크론이 필요 없다).
 *
 * 인증: Vercel Cron이 붙이는 `Authorization: Bearer <CRON_SECRET>`을 직접 비교한다
 * (`newbie-nudge`와 같은 패턴). 이 라우트는 회비·칭호 데이터를 쓰므로 인증이 필수다.
 *
 * 실행 대상: `use_yn = true` AND `freq_cd IS NOT NULL`(null = 수동 전용).
 *   - 이번 주기에 **성공 이력이 있으면 건너뛴다** → 크론이 밀려도 따라잡고,
 *     단장이 먼저 손으로 돌렸으면 자동은 그냥 넘어간다.
 *   - **살아 있는 `running`이 있으면 건너뛴다**(동시 실행 방지). 30분 넘긴 `running`은
 *     좀비로 보고 `failed`로 마감한 뒤 진행한다 — 안 그러면 그 job이 영원히 막힌다.
 */

// 배치는 팀 전원을 훑을 수 있어 기본 타임아웃으로는 모자랄 수 있다(설계 §3.8).
export const maxDuration = 300;

type JobRow = {
  job_id: string;
  job_cd: string;
  job_nm: string;
  freq_cd: string | null;
  team_id: string | null;
  param_schema_json: unknown;
};

type Outcome = {
  job_cd: string;
  status: "success" | "failed" | "skipped";
  reason?: string;
  message?: string;
};

/** 배치 실패는 조용히 묻히면 안 된다 — 자동 실행은 화면을 보는 사람이 없다(설계 §3.4). */
async function notifyAdmins(
  db: ReturnType<typeof createAdminClient>,
  teamId: string | null,
  jobNm: string,
  message: string,
) {
  if (!teamId) return;
  const { data: admins } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("role_cd", "ADMIN")
    .eq("vers", 0)
    .eq("del_yn", false);

  await Promise.all(
    (admins ?? []).map((a) =>
      insertNoti({
        teamId,
        memId: a.mem_id,
        notiTypeEnm: "batch_failed",
        notiNm: `배치 실패: ${jobNm}`,
        notiCont: message.slice(0, 200),
      }).catch((e) => console.error("[cron/batch] 실패 알림 전송 실패", e)),
    ),
  );
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET 미설정" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const now = dayjs();

  const { data: jobs, error: jobErr } = await db
    .from("batch_job_mst")
    .select("job_id, job_cd, job_nm, freq_cd, team_id, param_schema_json")
    .eq("use_yn", true)
    .not("freq_cd", "is", null)
    .order("crt_at", { ascending: true });

  if (jobErr) {
    console.error("[cron/batch] job 조회 실패", jobErr);
    return NextResponse.json({ ok: false, error: jobErr.message }, { status: 500 });
  }

  const outcomes: Outcome[] = [];

  for (const job of (jobs ?? []) as JobRow[]) {
    const freq = job.freq_cd as FreqCd;

    // 이 job의 최근 이력만 본다(주기 판정 + 동시 실행 방지에 충분).
    const { data: runs } = await db
      .from("batch_run_hist")
      .select("run_id, status, started_at")
      .eq("job_id", job.job_id)
      .order("started_at", { ascending: false })
      .limit(20);
    const runRows = runs ?? [];

    // 좀비 running 마감 — 이걸 안 하면 타임아웃으로 죽은 job이 영원히 막힌다.
    const zombies = staleRunningIds(runRows, now);
    if (zombies.length) {
      await db
        .from("batch_run_hist")
        .update({
          status: "failed",
          result_msg: `실행이 ${30}분 넘게 끝나지 않아 중단된 것으로 마감했습니다(타임아웃 추정).`,
          finished_at: now.toISOString(),
        })
        .in("run_id", zombies);
    }

    if (hasLiveRun(runRows, now)) {
      outcomes.push({ job_cd: job.job_cd, status: "skipped", reason: "이미 실행 중" });
      continue;
    }
    if (hasSucceededThisCycle(runRows, freq)) {
      outcomes.push({ job_cd: job.job_cd, status: "skipped", reason: "이번 주기에 이미 성공" });
      continue;
    }
    if (!job.team_id) {
      outcomes.push({ job_cd: job.job_cd, status: "skipped", reason: "team_id 미설정" });
      continue;
    }

    const params = buildAutoParams(job.param_schema_json as ParamField[] | null);
    const outcome = await executeBatch(job.job_id, params, "auto", {
      teamId: job.team_id,
      // 자동 실행에는 사람이 없다. 화면은 trig_type으로 "자동"을 보여 준다.
      actorMemId: null,
    });

    if (!outcome.ok) {
      await notifyAdmins(db, job.team_id, job.job_nm, outcome.message);
    }
    outcomes.push({
      job_cd: job.job_cd,
      status: outcome.ok ? "success" : "failed",
      message: outcome.message,
    });
  }

  return NextResponse.json({ ok: true, ran: outcomes.length, outcomes });
}
