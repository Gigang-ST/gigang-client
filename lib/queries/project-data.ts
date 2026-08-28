// 프로젝트 페이지 공유 데이터 — React cache()로 요청 내 중복 쿼리 제거
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextMonthStr } from "@/lib/dayjs";

const PAGE_SIZE = 1000;

/**
 * PostgREST 기본 응답 상한(1000행)을 넘는 쿼리를 `.range()`로 끝까지 긁어온다.
 *
 * `getEventLogsCumulative`가 이 페이지네이션 없이 5개월치(1,401건)를 한 번에 읽다가
 * 뒤 401건이 조용히 잘려 환급 예정액이 낮게 계산된 사고가 있었다(2026-08-27) — 에러가
 * 안 나서 한참을 캐시 문제로 오인했다. `queryBuilder`는 매 페이지 **정렬 기준이 고정된**
 * 쿼리를 돌려줘야 한다(정렬 없이 range()만 반복하면 페이지 사이에 행이 중복되거나 빠질 수 있다).
 */
async function fetchAllRows<T>(
  queryBuilder: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryBuilder(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`fetchAllRows 페이지 조회 실패(from=${from}): ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

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
    const data = await fetchAllRows((from, to) =>
      db
        .from("evt_mlg_mth_snap")
        .select("goal_id, prt_id, base_dt, goal_mlg, achv_yn, act_cnt, achv_mlg, lst_act_dt, evt_team_prt_rel!inner(mem_id, evt_id)")
        .eq("evt_team_prt_rel.evt_id", evtId)
        .gte("base_dt", queryStart)
        .lte("base_dt", endMonth)
        .order("goal_id", { ascending: true })
        .range(from, to),
    );
    return data.map((row) => {
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
    const data = await fetchAllRows((from, to) =>
      db
        .from("evt_mlg_act_hist")
        .select(
          "act_id, prt_id, act_dt, final_mlg, sprt_enm, dst_km, elv_m, base_mlg, aply_mults, review, evt_team_prt_rel!inner(mem_id, evt_id)",
        )
        .eq("evt_team_prt_rel.evt_id", evtId)
        .gte("act_dt", queryStart)
        .lt("act_dt", nextMonthStr(endMonth))
        .order("act_id", { ascending: true })
        .range(from, to),
    );
    return data.map((row) => {
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
