import { lookbackStartFrom } from "@/lib/batch/lookback";
import { capChanges } from "@/lib/batch/types";
import { dayjs } from "@/lib/dayjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateAndGrantTitles, loadAutoTitles } from "@/lib/titles/engine";
import { ATTEND_GRACE_DAYS } from "@/lib/titles/types";

import type { BatchChange, BatchContext, BatchResult } from "@/lib/batch/types";
import type { TitleEvalContext } from "@/lib/titles/types";

const KST = "Asia/Seoul";

async function resolveLookbackStart(
  db: ReturnType<typeof createAdminClient>,
  jobId: string,
  asOfDt: string,
): Promise<string> {
  const { data } = await db
    .from("batch_run_hist")
    .select("started_at")
    .eq("job_id", jobId)
    .eq("status", "success")
    .order("started_at", { ascending: false })
    .limit(1);

  return lookbackStartFrom((data ?? [])[0]?.started_at ?? null, asOfDt);
}

/**
 * 구간에 **모임에 참석했거나 대회를 뛴** 멤버.
 *
 * 참석 계열 조건(#1·#3·#5)은 전부 "내가 참석한 모임"에 기반하므로, 그 구간에 새로 잡히는
 * 모임에 안 나간 사람은 값이 그대로라 새로 통과할 수가 없다.
 *
 * ⚠️ **대회도 함께 본다** — `생일축하해`(#22)는 모임뿐 아니라 **대회 출전**으로도 붙는다.
 * 모임 참석자만 추리면 생일에 대회만 뛴 사람이 조용히 빠진다.
 */
async function membersWithActivityBetween(
  db: ReturnType<typeof createAdminClient>,
  teamId: string,
  sinceDt: string,
  asOfDt: string,
): Promise<Set<string>> {
  const startTs = dayjs.tz(sinceDt, KST).toISOString();
  // 상한은 그날 끝까지 — `asOfDt` 당일에 시작한 모임도 포함해야 한다.
  const endTs = dayjs.tz(asOfDt, KST).add(1, "day").toISOString();

  const [gthr, race] = await Promise.all([
    db
      .from("gthr_attd_rel")
      .select("mem_id, gthr_mst!inner(stt_at, team_id, del_yn)")
      .eq("gthr_mst.team_id", teamId)
      .eq("gthr_mst.del_yn", false)
      .gte("gthr_mst.stt_at", startTs)
      .lt("gthr_mst.stt_at", endTs),
    db
      .from("rec_race_hist")
      .select("mem_id")
      .eq("vers", 0)
      .eq("del_yn", false)
      .gte("race_dt", sinceDt)
      .lte("race_dt", asOfDt),
  ]);

  const ids = new Set<string>();
  for (const r of (gthr.data ?? []) as { mem_id: string }[]) ids.add(r.mem_id);
  for (const r of (race.data ?? []) as { mem_id: string }[]) ids.add(r.mem_id);
  return ids;
}

/**
 * 팀의 활성 멤버를 돌며 칭호를 평가한다. 두 배치가 공유하는 몸통.
 *
 * ⚠️ **이 파일은 `"use server"`가 아니다**(IDOR 방지 — `dues-exemption.ts` 주석 참조).
 *
 * 멤버마다 엔진을 한 번씩 부른다(N번). 스냅샷 일괄 평가를 쓰지 않는 이유는 모임 조건이
 * `MemberSnapshot`에 없어서다(설계 §7.3) — 수십 명 규모에서 하루 한 번이라 감당된다.
 * 멤버가 크게 늘면 그때 스냅샷을 확장해 sweep 경로로 옮긴다.
 */
async function evaluateTeam(
  teamId: string,
  makeCtx: (teamMemId: string) => TitleEvalContext,
  /**
   * 평가할 `mem_id` 집합. **null이면 활성 멤버 전원**.
   *
   * 일 배치는 "값이 바뀔 수 있는 사람"으로 좁혀 넘긴다 — 참석 계열은 창에 새 모임이
   * 들어온 사람만 값이 커지므로, 대부분의 날 나머지를 도는 건 통째로 낭비다.
   */
  onlyMemIds: Set<string> | null = null,
): Promise<{ evaluated: number; changes: BatchChange[]; errors: string[] }> {
  const db = createAdminClient();

  if (onlyMemIds && onlyMemIds.size === 0) {
    return { evaluated: 0, changes: [], errors: [] };
  }

  const { data: allMembers, error } = await db
    .from("team_mem_rel")
    .select("team_mem_id, mem_id")
    .eq("team_id", teamId)
    .eq("mem_st_cd", "active")
    .eq("vers", 0)
    .eq("del_yn", false);
  if (error) throw new Error(`대상 멤버 조회 실패: ${error.message}`);

  const members = onlyMemIds
    ? (allMembers ?? []).filter((m) => onlyMemIds.has(m.mem_id))
    : (allMembers ?? []);
  if (!members.length) return { evaluated: 0, changes: [], errors: [] };

  const { data: memRows } = await db
    .from("mem_mst")
    .select("mem_id, mem_nm")
    .in("mem_id", members.map((m) => m.mem_id));
  const nameById = new Map((memRows ?? []).map((r) => [r.mem_id, r.mem_nm]));

  // 칭호 목록은 **루프 밖에서 한 번**만 읽는다. 안에서 부르면 멤버 수만큼(수백 번)
  // 같은 `ttl_mst` 전체 조회가 나간다 — dev에서 배치가 30초를 넘긴 원인 중 하나였다.
  const autoTitles = await loadAutoTitles(db, teamId);

  // 실행 1회짜리 조회 캐시를 **모든 멤버가 공유한다.** 팀 공통 조회(그 달 모임 수·팀 댓글
  // 1위·응원 원장)가 멤버 수만큼 반복되던 걸 1번으로 묶는다 — 월 배치 20초의 주범이었다.
  // 멤버별 조회는 캐시 키에 mem_id가 들어 있어 공유해도 각자 1번 그대로다.
  const sharedCache = new Map<string, unknown>();

  const changes: BatchChange[] = [];
  const errors: string[] = [];

  for (const m of members) {
    try {
      const granted = await evaluateAndGrantTitles(
        makeCtx(m.team_mem_id),
        autoTitles,
        sharedCache,
      );
      for (const ttlNm of granted) {
        changes.push({
          memNm: nameById.get(m.mem_id) ?? m.mem_id,
          what: `'${ttlNm}' 칭호 획득`,
        });
      }
    } catch (e) {
      // 한 명이 실패해도 나머지는 계속 본다 — 칭호는 서로 독립이다.
      errors.push(`${nameById.get(m.mem_id) ?? m.mem_id}: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    }
  }

  return { evaluated: members.length, changes, errors };
}

/**
 * 모임 참석 계열 일 배치.
 *
 * **끝난 지 `ATTEND_GRACE_DAYS`일 지난 모임까지만** 센다. `gthr_attd_rel`에 출석 체크 컬럼이
 * 없어 "참석"이 곧 신청 상태인데, 운영진이 안 나온 사람을 사후에 취소 처리하므로 명단이
 * 정리될 시간을 준다(설계 §4.1).
 *
 * 즉시 판정하면 두 번 틀린다 — ① 아직 열리지도 않은 모임을 신청만 해도 칭호가 붙고
 * ② 엔진이 비회수라 취소해도 안 없어진다.
 */
export async function batchTitleGatheringDaily(ctx: BatchContext): Promise<BatchResult> {
  const db = createAdminClient();
  const asOfDt = dayjs().tz(KST).subtract(ATTEND_GRACE_DAYS, "day").format("YYYY-MM-DD");

  // 창에 **새로 들어온** 모임의 참석자만 값이 바뀔 수 있다 — 나머지를 도는 건 낭비다.
  const sinceDt = await resolveLookbackStart(db, ctx.jobId, asOfDt);
  const targets = await membersWithActivityBetween(db, ctx.teamId, sinceDt, asOfDt);

  const { evaluated, changes, errors } = await evaluateTeam(
    ctx.teamId,
    (teamMemId) => ({
      trigger: "gathering_daily",
      teamId: ctx.teamId,
      teamMemId,
      asOfDt,
    }),
    targets,
  );

  const msg =
    `${evaluated}명 평가, ${changes.length}개 칭호 부여 ` +
    `(${sinceDt}~${asOfDt}에 활동한 사람 대상)`;
  if (errors.length) {
    throw new Error(`${msg} / 오류 ${errors.length}건: ${errors.slice(0, 3).join("; ")}`);
  }

  const capped = capChanges(changes);
  return {
    msg,
    metrics: [
      { label: "평가", value: evaluated },
      { label: "부여", value: changes.length },
    ],
    changedCount: changes.length,
    changes: capped.changes,
    warnings: capped.warnings.length ? capped.warnings : null,
  };
}

/**
 * 월 마감 칭호 배치 — **달이 끝나야 값이 정해지는** 조건.
 *
 * 지금은 `프로참석러`(그 달 참석률) 하나다. 달 중간에 75%였다가 남은 모임을 빠지면 최종은
 * 70% 아래인데 엔진이 비회수라 먼저 준 칭호는 안 돌아온다 — 그래서 월이 끝난 뒤에만 본다.
 *
 * `baseMonth`는 **지난 달**이어야 한다(진행 중인 달을 확정하면 잠정값으로 줘 버린다).
 */
export async function batchTitleMonthly(
  ctx: BatchContext,
  baseMonth?: string,
): Promise<BatchResult> {
  const ym = baseMonth ?? dayjs().tz(KST).subtract(1, "month").format("YYYY-MM");
  const curYm = dayjs().tz(KST).format("YYYY-MM");
  if (ym >= curYm) {
    throw new Error(`진행 중이거나 미래인 달(${ym})은 평가할 수 없습니다. 마감된 전월 이하만 가능합니다.`);
  }

  // 그 달 안에서만 판정하도록 상한을 월말로 준다.
  const monthEnd = dayjs.tz(`${ym}-01`, KST).endOf("month").format("YYYY-MM-DD");

  // ⚠️ 월 배치는 **전원을 돈다**(좁히지 않는다). 조건이 넷인데 대상이 서로 달라서다 —
  // 참석률은 그 달 참석자, 댓글 1위는 그 달 댓글 작성자, 응원(#18)은 누구나, 페어(#21)는
  // 대회 기록 보유자. 합집합이 사실상 전원이라 좁히는 이득이 없고, 월 1회라 감당된다.
  const { evaluated, changes, errors } = await evaluateTeam(ctx.teamId, (teamMemId) => ({
    trigger: "title_monthly",
    teamId: ctx.teamId,
    teamMemId,
    baseMonth: ym,
    // 월 조건도 모임 창(asOfDt)을 쓰므로 월말을 상한으로 넘긴다 — 다음 달 모임이 섞이면
    // "그 달 참석률"이 아니게 된다.
    asOfDt: monthEnd,
  }));

  const msg = `${evaluated}명 평가, ${changes.length}개 칭호 부여 (기준 월: ${ym})`;
  if (errors.length) {
    throw new Error(`${msg} / 오류 ${errors.length}건: ${errors.slice(0, 3).join("; ")}`);
  }

  const capped = capChanges(changes);
  return {
    msg,
    metrics: [
      { label: "평가", value: evaluated },
      { label: "부여", value: changes.length },
    ],
    changedCount: changes.length,
    changes: capped.changes,
    warnings: capped.warnings.length ? capped.warnings : null,
  };
}
