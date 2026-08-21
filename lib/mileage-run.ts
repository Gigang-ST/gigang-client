import type { SupabaseClient } from "@supabase/supabase-js";

import {
  currentMonthKST,
  dayjs,
  prevMonthStr,
  todayDayKST,
  todayKST,
} from "@/lib/dayjs";
import {
  computeGoalChain,
  isMonthAchieved,
  roundMileage,
  type MileageSport,
} from "@/lib/mileage";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 마일리지런 쓰기 경로의 **공용 코어**.
 *
 * ## 왜 액션에서 떼어냈나
 * `app/actions/mileage-run.ts` 는 `withActive` → `getCurrentMember()` → **세션 쿠키**에 묶여
 * 있어 PAT 로 오는 운영 MCP 요청에서는 그대로 못 쓴다(#485에서 모임 개설이 같은 벽에 부딪혔다).
 * 그렇다고 MCP 쪽에 날짜 규칙·배율 적용·목표 연쇄 재계산을 **복사**하면, 보증금 환급이 걸린
 * 계산이 두 벌이 되어 한쪽만 고쳐지는 날 사람 돈이 어긋난다.
 *
 * 그래서 **판정·계산은 여기 한 곳**에 두고, 위 두 경로는 각자의 신원 해석(세션 / PAT)과
 * 프레임워크 부수효과(`revalidatePath`·`updateTag`·`after`)만 자기 쪽에서 처리한다.
 *
 * ## 규약
 * - **Supabase 클라이언트 주입식**: `admin.ts`(server-only)를 import 하지 않는다.
 *   덕분에 vitest 가 이 모듈을 직접 로드할 수 있다([[troubleshooting/vitest-server-only-trap]]).
 * - **`next/*` 를 import 하지 않는다**: 캐시 무효화는 호출부의 몫이다. 여기에 넣으면
 *   MCP 라우트·서버 액션이 서로 다른 실행 컨텍스트를 갖는 문제가 이 모듈로 새어 들어온다.
 * - 함수 본문은 액션에 있던 것을 **그대로** 옮긴 것이다(db 인자만 추가). 로직 변경 없음.
 */

type Db = SupabaseClient<Database>;

/** 활동 로그 1건 입력. 액션·MCP 양쪽이 공유하는 형상. */
export interface ActivityLogInput {
  act_dt: string; // 'YYYY-MM-DD'
  sprt_enm: MileageSport;
  distance_km: number;
  elevation_m: number;
  applied_mult_ids: string[]; // evt_mlg_mult_cfg.mult_id 배열
  review: string | null;
  /**
   * 사진 공개 URL(선택). 값이 있으면 DB 트리거가 이 기록을 기강이야기에도 세운다.
   * MCP 경로는 항상 null 이다 — `File` 이 JSON 경계를 못 넘어 사진을 받을 수 없다.
   */
  photo_url?: string | null;
}

export type AppliedMult = { mult_id: string; mult_nm: string; mult_val: number };

/**
 * 활동 날짜 규칙(앱과 MCP 공통). admin 은 프리패스.
 *
 * - 미래 날짜 불가
 * - 2개월 이전 불가
 * - 전월 기록은 매월 3일까지
 */
export function validateActivityDate(actDt: string, isAdmin: boolean): string | null {
  if (isAdmin) return null;

  const today = todayKST();
  if (actDt > today) return "미래 날짜에는 기록을 추가할 수 없습니다";

  const currentMonth = currentMonthKST().slice(0, 7);
  const actMonth = actDt.slice(0, 7);

  if (actMonth < currentMonth) {
    const dayOfMonth = todayDayKST();
    const prevMonthStr2 = prevMonthStr(currentMonthKST()).slice(0, 7);

    if (actMonth < prevMonthStr2) return "2개월 이전 기록은 추가할 수 없습니다";
    if (dayOfMonth > 3) return "전월 기록은 매월 3일까지만 추가할 수 있습니다";
  }

  return null;
}

/** 배율 행이 그 날짜에 유효한가(활성 + 기간 안). 자동 적용·수동 적용이 같은 판정을 쓴다. */
function isMultActiveOn(
  mult: { stt_dt: string | null; end_dt: string | null; active_yn: boolean | null },
  actDt: string,
): boolean {
  if (!mult.active_yn) return false;
  if (mult.stt_dt && actDt < mult.stt_dt) return false;
  if (mult.end_dt && actDt > mult.end_dt) return false;
  return true;
}

/**
 * 요청된 배율 id 중 **그 날짜에 유효한 것만** 골라 값과 함께 돌려준다.
 * 유효하지 않은 id 는 조용히 빠진다(폼이 체크해 둔 배율이 기간을 벗어난 경우).
 */
export async function buildAppliedMults(
  db: Db,
  evtId: string,
  multIds: string[],
  actDt: string,
): Promise<{
  appliedMults: AppliedMult[];
  multValues: number[];
  error: string | null;
}> {
  if (multIds.length === 0) return { appliedMults: [], multValues: [], error: null };

  const { data, error } = await db
    .from("evt_mlg_mult_cfg")
    .select("mult_id, mult_nm, mult_val, stt_dt, end_dt, active_yn")
    .eq("evt_id", evtId)
    .in("mult_id", multIds);

  if (error) return { appliedMults: [], multValues: [], error: "배율 조회에 실패했습니다" };

  const appliedMults: AppliedMult[] = [];
  const multValues: number[] = [];

  for (const mult of data ?? []) {
    if (!isMultActiveOn(mult, actDt)) continue;
    appliedMults.push({
      mult_id: mult.mult_id,
      mult_nm: mult.mult_nm,
      mult_val: Number(mult.mult_val),
    });
    multValues.push(Number(mult.mult_val));
  }

  return { appliedMults, multValues, error: null };
}

/**
 * 그 날짜에 **유효한** 배율 목록(활성 + 기간 안). 판정은 `buildAppliedMults` 와 **같은 함수**
 * (`isMultActiveOn`)를 쓴다 — 고를 때와 적용할 때가 갈리면 "적용됐다고 했는데 마일리지가
 * 안 늘었다"가 된다.
 *
 * 여기서 돌려주는 건 **후보**일 뿐 적용 대상이 아니다. 배율의 성립 조건(모임 참석 여부·
 * 벙주/참석자·LSD 인원수·주당 횟수)은 `evt_mlg_mult_cfg` 에 적을 칼럼조차 없어 서버가 판정할
 * 수 없다. 그래서 앱 폼도 MCP 도구도 **사용자가 직접 고르는** 자기신고다 — 한때 MCP 만
 * "그날 걸린 것 전부"를 자동으로 붙여, 혼자 1km 뛴 기록에 `3인이상 LSD`·`모임참석(벙주)`·
 * `모임참석(참석자)` 가 동시에 곱해졌다(#504).
 */
export async function listMultipliersActiveOn(
  db: Db,
  evtId: string,
  actDt: string,
): Promise<{ mult_id: string; mult_nm: string; mult_val: number }[]> {
  const { data, error } = await db
    .from("evt_mlg_mult_cfg")
    .select("mult_id, mult_nm, mult_val, stt_dt, end_dt, active_yn")
    .eq("evt_id", evtId);
  if (error) return [];
  return (data ?? [])
    .filter((m) => isMultActiveOn(m, actDt))
    .map((m) => ({
      mult_id: m.mult_id as string,
      mult_nm: m.mult_nm as string,
      mult_val: Number(m.mult_val),
    }));
}

/**
 * 월별 목표 연쇄 재계산.
 *
 * anchorIdx 다음 달부터, 이전 달의 목표·달성 여부를 근거로 각 달 목표를 다시 계산한다.
 * 순수 계산은 `computeGoalChain`(lib/mileage.ts)이 하고, 여기선 집계·읽기·쓰기를 맡는다.
 */
export async function recalcGoalsFromMonth(
  db: Db,
  evtId: string,
  prtId: string,
  anchorGoalId?: string,
): Promise<void> {
  const { data: evt } = await db
    .from("evt_team_mst")
    .select("stt_dt, end_dt")
    .eq("evt_id", evtId)
    .single();
  if (!evt) return;

  const evtStartMonth = evt.stt_dt.slice(0, 7) + "-01";

  const { data: goals } = await db
    .from("evt_mlg_mth_snap")
    .select("goal_id, base_dt, goal_mlg, achv_yn")
    .eq("prt_id", prtId)
    .order("base_dt", { ascending: true });

  if (!goals || goals.length === 0) return;

  const { data: allLogs } = await db
    .from("evt_mlg_act_hist")
    .select("act_dt, final_mlg")
    .eq("prt_id", prtId);

  const mlgByMonth = new Map<string, number>();
  const cntByMonth = new Map<string, number>();
  const lastDtByMonth = new Map<string, string>();
  for (const log of allLogs ?? []) {
    const m = (log.act_dt as string).slice(0, 7) + "-01";
    mlgByMonth.set(m, (mlgByMonth.get(m) ?? 0) + Number(log.final_mlg));
    cntByMonth.set(m, (cntByMonth.get(m) ?? 0) + 1);
    const prevLast = lastDtByMonth.get(m);
    const actDt = log.act_dt as string;
    if (!prevLast || actDt > prevLast) lastDtByMonth.set(m, actDt);
  }
  const roundedAchvByMonth = new Map<string, number>();
  for (const [month, totalMlg] of mlgByMonth.entries()) {
    roundedAchvByMonth.set(month, roundMileage(totalMlg));
  }

  for (const g of goals) {
    const month = g.base_dt as string;
    const achvMlg = roundedAchvByMonth.get(month) ?? 0;
    const actCnt = cntByMonth.get(month) ?? 0;
    const lstActDt = lastDtByMonth.get(month) ?? null;
    const achvYn = isMonthAchieved(achvMlg, Number(g.goal_mlg));

    const { error: snapErr } = await db
      .from("evt_mlg_mth_snap")
      .update({
        achv_mlg: achvMlg,
        act_cnt: actCnt,
        lst_act_dt: lstActDt,
        achv_yn: achvYn,
        updated_at: dayjs().toISOString(),
      })
      .eq("goal_id", g.goal_id);
    if (snapErr)
      throw new Error(`월별 집계 갱신 실패 (goal_id=${g.goal_id}): ${snapErr.message}`);
    g.achv_yn = achvYn;
  }

  let anchorIdx = 0;
  if (anchorGoalId) {
    const found = goals.findIndex((g) => g.goal_id === anchorGoalId);
    if (found > 0) anchorIdx = found;
  }

  const chain = computeGoalChain(
    goals.map((g) => ({
      base_dt: g.base_dt as string,
      goal_mlg: Number(g.goal_mlg),
      achv_mlg: roundedAchvByMonth.get(g.base_dt as string) ?? 0,
    })),
    evtStartMonth,
    anchorIdx,
  );

  for (let i = anchorIdx + 1; i < goals.length; i++) {
    const cur = goals[i];
    const next = chain[i];
    if (Number(cur.goal_mlg) === next.goal_mlg) continue;

    const { error: chainErr } = await db
      .from("evt_mlg_mth_snap")
      .update({
        goal_mlg: next.goal_mlg,
        achv_yn: next.achv_yn,
        updated_at: dayjs().toISOString(),
      })
      .eq("goal_id", cur.goal_id);
    if (chainErr)
      throw new Error(`목표 연쇄 갱신 실패 (goal_id=${cur.goal_id}): ${chainErr.message}`);
    cur.goal_mlg = next.goal_mlg;
    cur.achv_yn = next.achv_yn;
  }
}
