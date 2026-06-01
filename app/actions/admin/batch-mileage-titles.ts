"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { batchEvaluateAndGrant } from "@/lib/titles/engine";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const KST = "Asia/Seoul";

/**
 * 마일리지런 월초 배치 칭호 평가 — 스냅샷 기반 bulk 처리.
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
  const admin = await verifyAdmin();
  if (!admin) throw new Error("관리자 권한이 필요합니다");

  const db = createAdminClient();

  const resolvedMonth = baseMonth
    ? baseMonth
    : dayjs().tz(KST).subtract(1, "month").format("YYYY-MM");

  const baseMonthStart = `${resolvedMonth}-01`;
  const baseMonthLastDay = dayjs(baseMonthStart).tz(KST).endOf("month").format("YYYY-MM-DD");

  // 기준 월이 이벤트 기간 안에 포함된 참여자만 조회
  const { data: prtRows, error } = await db
    .from("evt_team_prt_rel")
    .select("mem_id, evt_id, evt_team_mst!inner(team_id, stt_dt, end_dt)")
    .eq("aprv_yn", true)
    .lte("evt_team_mst.stt_dt", baseMonthLastDay)
    .gte("evt_team_mst.end_dt", baseMonthStart);

  if (error || !prtRows?.length) {
    return `평가 대상 참여자 없음 (기준 월: ${resolvedMonth})`;
  }

  // mem_id → team_mem_id, team_id 맵 구성
  const memIds = [...new Set(prtRows.map((r) => r.mem_id))];
  const { data: teamMemRows } = await db
    .from("team_mem_rel")
    .select("mem_id, team_mem_id, team_id")
    .in("mem_id", memIds)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (!teamMemRows?.length) {
    return `팀 멤버 매핑 실패 (기준 월: ${resolvedMonth})`;
  }

  // mem_id → evt_id 맵
  const memEvtMap = new Map<string, string>();
  for (const r of prtRows) memEvtMap.set(r.mem_id, r.evt_id);

  // team_id별로 team_mem_id 묶기
  const teamMap = new Map<string, { teamMemIds: string[]; evtId: string }>();
  for (const r of teamMemRows) {
    const evtId = memEvtMap.get(r.mem_id) ?? "";
    if (!teamMap.has(r.team_id)) teamMap.set(r.team_id, { teamMemIds: [], evtId });
    teamMap.get(r.team_id)!.teamMemIds.push(r.team_mem_id);
  }

  let totalGranted = 0;
  for (const [teamId, { teamMemIds, evtId }] of teamMap.entries()) {
    const { granted } = await batchEvaluateAndGrant(teamId, teamMemIds, resolvedMonth, evtId);
    totalGranted += granted;
  }

  return `${memIds.length}명 평가 완료, ${totalGranted}개 칭호 부여 (기준 월: ${resolvedMonth})`;
}
