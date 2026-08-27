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
      "mem_id, init_goal, stt_mth, deposit_amt, entry_fee_amt, mem_mst!inner(mem_nm)",
    )
    .eq("evt_id", evtId)
    .eq("aprv_yn", true);
  return data ?? [];
});

/** 이벤트 당월 목표 */
export const getEventGoalsMonthly = cache(async (evtId: string, month: string) => {
  const db = createAdminClient();
  const { data } = await db
    .from("evt_mlg_mth_snap")
    .select("prt_id, base_dt, goal_mlg, achv_yn, act_cnt, achv_mlg, lst_act_dt, evt_team_prt_rel!inner(mem_id, evt_id)")
    .eq("evt_team_prt_rel.evt_id", evtId)
    .eq("base_dt", month);
  return (data ?? []).map((row) => {
    const rel = row.evt_team_prt_rel as { mem_id: string; evt_id: string };
    return { ...row, mem_id: rel.mem_id, evt_id: rel.evt_id };
  });
});

/**
 * 이벤트 누적 목표 (startMonth ~ endMonth 포함).
 *
 * `unstable_cache`로 요청 간 캐시하지 않는다 — 환급 예정액 계산에 직접 들어가는 값인데,
 * 이 프로젝트 배포 환경에서 태그 기반 무효화(`updateTag`/`revalidateTag`)가 실제로는
 * 안 지워지는 걸 이미 겪었다(§DESIGN.md 기강의 전당 캐시). 참가자 수십 명 규모의
 * 가벼운 쿼리라 매 요청 조회해도 비용이 미미하다 — 돈 계산은 옛 값이 눌어붙는 것보다
 * 매번 새로 읽는 쪽이 낫다.
 */
export const getEventGoalsCumulative = cache(
  async (evtId: string, startMonth: string, endMonth: string) => {
    const queryStart = startMonth <= endMonth ? startMonth : endMonth;
    const db = createAdminClient();
    const { data } = await db
      .from("evt_mlg_mth_snap")
      .select("prt_id, base_dt, goal_mlg, achv_yn, act_cnt, achv_mlg, lst_act_dt, evt_team_prt_rel!inner(mem_id, evt_id)")
      .eq("evt_team_prt_rel.evt_id", evtId)
      .gte("base_dt", queryStart)
      .lte("base_dt", endMonth);
    return (data ?? []).map((row) => {
      const rel = row.evt_team_prt_rel as { mem_id: string; evt_id: string };
      return { ...row, mem_id: rel.mem_id, evt_id: rel.evt_id };
    });
  },
);

/** 이벤트 당월 활동 로그 (month ~ nextMonth 1일 exclusive) */
export const getEventLogsMonthly = cache(async (evtId: string, month: string) => {
  const db = createAdminClient();
  const { data } = await db
    .from("evt_mlg_act_hist")
    .select(
      "act_id, prt_id, act_dt, final_mlg, sprt_enm, dst_km, elv_m, base_mlg, aply_mults, review, evt_team_prt_rel!inner(mem_id, evt_id)",
    )
    .eq("evt_team_prt_rel.evt_id", evtId)
    .gte("act_dt", month)
    .lt("act_dt", nextMonthStr(month));
  return (data ?? []).map((row) => {
    const rel = row.evt_team_prt_rel as { mem_id: string; evt_id: string };
    return {
      ...row,
      mem_id: rel.mem_id,
      evt_id: rel.evt_id,
      distance_km: row.dst_km,
      elevation_m: row.elv_m,
      applied_mults: row.aply_mults,
    };
  });
});

/**
 * 이벤트 누적 활동 로그 (startDate ~ endMonth 1일 exclusive).
 *
 * `getEventGoalsCumulative`와 같은 이유로 `unstable_cache` 없이 매 요청 조회한다.
 */
export const getEventLogsCumulative = cache(
  async (evtId: string, startDate: string, endMonth: string) => {
    const queryStart = startDate <= endMonth ? startDate : endMonth;
    const db = createAdminClient();
    const { data } = await db
      .from("evt_mlg_act_hist")
      .select(
        "act_id, prt_id, act_dt, final_mlg, sprt_enm, dst_km, elv_m, base_mlg, aply_mults, review, evt_team_prt_rel!inner(mem_id, evt_id)",
      )
      .eq("evt_team_prt_rel.evt_id", evtId)
      .gte("act_dt", queryStart)
      .lt("act_dt", nextMonthStr(endMonth));
    return (data ?? []).map((row) => {
      const rel = row.evt_team_prt_rel as { mem_id: string; evt_id: string };
      return {
        ...row,
        mem_id: rel.mem_id,
        evt_id: rel.evt_id,
        distance_km: row.dst_km,
        elevation_m: row.elv_m,
        applied_mults: row.aply_mults,
      };
    });
  },
);
