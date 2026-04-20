// 프로젝트 페이지 공유 데이터 — React cache()로 요청 내 중복 쿼리 제거
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextMonthStr } from "@/lib/dayjs";

/** 이벤트 승인 참여자 (이름 포함) */
export const getEventParticipants = cache(async (evtId: string) => {
  const db = createAdminClient();
  const { data } = await db
    .from("evt_team_prt_rel")
    .select(
      "mem_id, init_goal, stt_month, deposit_amt, entry_fee_amt, mem_mst!inner(mem_nm)",
    )
    .eq("evt_id", evtId)
    .eq("approve_yn", true);
  return data ?? [];
});

/** 이벤트 당월 목표 */
export const getEventGoalsMonthly = cache(async (evtId: string, month: string) => {
  const db = createAdminClient();
  const { data } = await db
    .from("evt_mlg_goal_cfg")
    .select("mem_id, goal_month, goal_val, achieved_yn")
    .eq("evt_id", evtId)
    .eq("goal_month", month);
  return data ?? [];
});

/** 이벤트 누적 목표 (startMonth ~ endMonth 포함) */
export const getEventGoalsCumulative = cache(
  async (evtId: string, startMonth: string, endMonth: string) => {
    const db = createAdminClient();
    const queryStart = startMonth <= endMonth ? startMonth : endMonth;
    const { data } = await db
      .from("evt_mlg_goal_cfg")
      .select("mem_id, goal_month, goal_val, achieved_yn")
      .eq("evt_id", evtId)
      .gte("goal_month", queryStart)
      .lte("goal_month", endMonth);
    return data ?? [];
  },
);

/** 이벤트 당월 활동 로그 (month ~ nextMonth 1일 exclusive) */
export const getEventLogsMonthly = cache(async (evtId: string, month: string) => {
  const db = createAdminClient();
  const { data } = await db
    .from("evt_mlg_act_hist")
    .select(
      "act_id, mem_id, act_dt, final_mlg, sport_cd, distance_km, elevation_m, base_mlg, applied_mults, review",
    )
    .eq("evt_id", evtId)
    .gte("act_dt", month)
    .lt("act_dt", nextMonthStr(month));
  return data ?? [];
});

/** 이벤트 누적 활동 로그 (startDate ~ endMonth 1일 exclusive) */
export const getEventLogsCumulative = cache(
  async (evtId: string, startDate: string, endMonth: string) => {
    const db = createAdminClient();
    const queryStart = startDate <= endMonth ? startDate : endMonth;
    const { data } = await db
      .from("evt_mlg_act_hist")
      .select(
        "act_id, mem_id, act_dt, final_mlg, sport_cd, distance_km, elevation_m, base_mlg, applied_mults, review",
      )
      .eq("evt_id", evtId)
      .gte("act_dt", queryStart)
      .lt("act_dt", nextMonthStr(endMonth));
    return data ?? [];
  },
);
