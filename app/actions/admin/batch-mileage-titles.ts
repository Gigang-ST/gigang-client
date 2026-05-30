"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { getCurrentMember } from "@/lib/queries/member";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const KST = "Asia/Seoul";

/**
 * 마일리지런 월초 배치 칭호 평가.
 * 전월 마감 후 확정되는 조건만 평가:
 *   - 내돈내놔 (mileage_goal_achieved_months: 5)
 *   - 보증금증발 (mileage_goal_failed_months: 1)
 *   - ATM (mileage_goal_failed_months: 3)
 *   - 러닝원툴 (mileage_goal_achieved_by_single_sport)
 *   - 수달·두바퀴인생·흙이좋아 (mileage_sport_ratio)
 *
 * @param baseMonth 기준 월 (YYYY-MM). 생략 시 전월 자동 계산.
 * @returns 결과 메시지
 */
export async function batchMileageTitles(baseMonth?: string): Promise<string> {
  await verifyAdmin();

  const { member } = await getCurrentMember();

  const db = createAdminClient();

  const resolvedMonth = baseMonth
    ? baseMonth
    : dayjs().tz(KST).subtract(1, "month").format("YYYY-MM");

  // 기준 월의 마지막 날 (evaluator의 actDt로 사용)
  const baseMonthLastDay = dayjs(`${resolvedMonth}-01`).tz(KST).endOf("month").format("YYYY-MM-DD");

  // 활성 마일리지런 참여자 전체 조회
  const { data: prtRows, error } = await db
    .from("evt_team_prt_rel")
    .select("prt_id, mem_id, evt_id, evt_team_mst!inner(team_id)")
    .eq("aprv_yn", true);

  if (error || !prtRows?.length) {
    throw new Error("참여자 조회에 실패했습니다");
  }

  // mem_id → team_mem_id, team_id 맵 구성
  const memIds = [...new Set(prtRows.map((r) => r.mem_id))];
  const { data: teamMemRows } = await db
    .from("team_mem_rel")
    .select("mem_id, team_mem_id, team_id")
    .in("mem_id", memIds)
    .eq("vers", 0)
    .eq("del_yn", false);

  const teamMemMap = new Map(
    (teamMemRows ?? []).map((r) => [r.mem_id, { teamMemId: r.team_mem_id, teamId: r.team_id }]),
  );

  let processed = 0;
  let granted = 0;

  for (const prt of prtRows) {
    const teamMem = teamMemMap.get(prt.mem_id);
    if (!teamMem) continue;

    const evtMst = Array.isArray(prt.evt_team_mst) ? prt.evt_team_mst[0] : prt.evt_team_mst;
    const teamId = (evtMst as { team_id: string }).team_id;

    const grantedTitles = await evaluateAndGrantTitles({
      trigger: "mileage_batch",
      teamId,
      teamMemId: teamMem.teamMemId,
      projectId: prt.evt_id,
      actDt: baseMonthLastDay,
    }).catch((e) => {
      console.error(`[batch-mileage-titles] mem_id=${prt.mem_id} 평가 실패`, e);
      return [] as string[];
    });

    granted += grantedTitles.length;
    processed++;
  }

  return `${processed}명 평가 완료, ${granted}개 칭호 부여 (기준 월: ${resolvedMonth})`;
}
