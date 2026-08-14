import { capChanges } from "@/lib/batch/types";
import { dayjs } from "@/lib/dayjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { batchEvaluateAndGrant } from "@/lib/titles/engine";

import type { BatchChange, BatchContext, BatchResult } from "@/lib/batch/types";
import type { BatchGrant } from "@/lib/titles/engine";

const KST = "Asia/Seoul";

/**
 * `YYYY-MM` → 그 달의 첫날·마지막날(둘 다 KST 기준).
 *
 * ⚠️ **`dayjs.tz(문자열, KST)`로 파싱해야 한다.** `dayjs("2026-08-01").tz(KST)`는 문자열을
 * **서버 로컬 자정**으로 먼저 읽고 그 순간을 KST로 옮길 뿐이라, 서버 타임존이 KST보다
 * 앞서면 순간이 전월로 밀려 `endOf("month")`가 **전월 마지막 날**을 돌려준다.
 * 지금 배포처는 UTC(KST보다 뒤)라 결과가 우연히 맞지만, 그 우연에 기대지 않는다.
 */
function monthBounds(ym: string): { baseMonthStart: string; baseMonthLastDay: string } {
  const start = dayjs.tz(`${ym}-01`, KST);
  return {
    baseMonthStart: start.format("YYYY-MM-DD"),
    baseMonthLastDay: start.endOf("month").format("YYYY-MM-DD"),
  };
}

type SeasonOutcome = {
  evtNm: string;
  evaluated: number;
  granted: number;
  grants: BatchGrant[];
  note: string | null;
};

/** 시즌 하나를 평가한다. 참여자가 없으면 granted 0으로 조용히 끝난다. */
async function runOneSeason(
  db: ReturnType<typeof createAdminClient>,
  teamId: string,
  evtId: string,
  evtNm: string,
  resolvedMonth: string,
): Promise<SeasonOutcome> {
  const { baseMonthStart, baseMonthLastDay } = monthBounds(resolvedMonth);

  // 기준 월에 걸치는 시즌인지를 여기서 한 번 더 거른다 — 안 겹치면 참여자가 0으로 나온다.
  const { data: prtRows, error } = await db
    .from("evt_team_prt_rel")
    .select("mem_id, evt_id, evt_team_mst!inner(team_id, stt_dt, end_dt)")
    .eq("evt_id", evtId)
    // 팀 경계 — 조인된 시즌이 이 배치의 팀 것인지 DB에서 다시 확인한다.
    .eq("evt_team_mst.team_id", teamId)
    .eq("aprv_yn", true)
    .lte("evt_team_mst.stt_dt", baseMonthLastDay)
    .gte("evt_team_mst.end_dt", baseMonthStart);

  if (error) {
    return { evtNm, evaluated: 0, granted: 0, grants: [], note: `참여자 조회 실패: ${error.message}` };
  }
  if (!prtRows?.length) {
    return { evtNm, evaluated: 0, granted: 0, grants: [], note: "평가 대상 참여자 없음" };
  }

  const memIds = [...new Set(prtRows.map((r) => r.mem_id))];
  const evtTeamIds = [
    ...new Set(
      prtRows.map((r) => {
        const evtMst = Array.isArray(r.evt_team_mst) ? r.evt_team_mst[0] : r.evt_team_mst;
        return (evtMst as { team_id: string }).team_id;
      }),
    ),
  ];

  const { data: teamMemRows, error: teamMemErr } = await db
    .from("team_mem_rel")
    .select("mem_id, team_mem_id, team_id")
    .in("mem_id", memIds)
    .in("team_id", evtTeamIds)
    .eq("vers", 0)
    .eq("del_yn", false);

  // 조회 실패와 "매핑할 게 없음"을 갈라 적는다 — 합치면 DB 오류가 배치 성공 안에 묻힌다.
  if (teamMemErr) {
    return {
      evtNm, evaluated: memIds.length, granted: 0, grants: [],
      note: `team_mem_rel 조회 실패: ${teamMemErr.message}`,
    };
  }
  if (!teamMemRows?.length) {
    return { evtNm, evaluated: memIds.length, granted: 0, grants: [], note: "team_mem_rel 매핑 실패" };
  }

  const memEvtMap = new Map<string, string>();
  for (const r of prtRows) memEvtMap.set(r.mem_id, r.evt_id);

  const teamMap = new Map<string, { teamMemIds: string[]; evtId: string }>();
  for (const r of teamMemRows) {
    const rowEvtId = memEvtMap.get(r.mem_id) ?? "";
    if (!teamMap.has(r.team_id)) teamMap.set(r.team_id, { teamMemIds: [], evtId: rowEvtId });
    teamMap.get(r.team_id)!.teamMemIds.push(r.team_mem_id);
  }

  let granted = 0;
  const grants: BatchGrant[] = [];
  for (const [teamId, { teamMemIds, evtId: mapEvtId }] of teamMap.entries()) {
    const res = await batchEvaluateAndGrant(teamId, teamMemIds, resolvedMonth, mapEvtId);
    granted += res.granted;
    grants.push(...res.grants);
  }

  return { evtNm, evaluated: memIds.length, granted, grants, note: null };
}

/**
 * 마일리지런 칭호 배치 — 전월 마감 후 확정되는 조건을 평가·부여한다.
 *
 * ⚠️ **이 파일은 `"use server"`가 아니다**(IDOR 방지 — `dues-exemption.ts` 주석 참조).
 *
 * `evtId`는 **어떤 마일리지런 시즌**을 대상으로 돌릴지다(`evt_team_mst` 한 행 = 시즌 하나).
 *
 * - **관리자 수동**: 드롭다운에서 고른 `evtId`를 넘긴다 → 그 시즌만.
 * - **크론 자동**: 고를 사람이 없으므로 `evtId`를 안 넘긴다 → **기준 월에 걸치는 `ACTIVE`
 *   시즌을 전부** 돈다(설계 §3.3). 시즌마다 참여자·목표가 독립이고 중복 부여는 엔진이
 *   막으므로(보유 중이면 스킵) "여럿이면 멈춘다" 같은 방어가 필요 없다.
 *   하나도 없으면 마일리지런이 안 도는 기간이라 실패가 아니다.
 *
 * job 하나당 실행이 하나로 유지되도록 **여러 시즌을 이 함수 안에서 돈다** — 크론이 시즌마다
 * `executeBatch`를 부르면 주기 체크(§3.2)가 첫 시즌의 성공만 보고 나머지를 건너뛰게 된다.
 */
export async function batchMileageTitles(
  ctx: BatchContext,
  evtId: string | undefined,
  baseMonth?: string,
): Promise<BatchResult> {
  const db = createAdminClient();

  const resolvedMonth = baseMonth
    ? baseMonth
    : dayjs().tz(KST).subtract(1, "month").format("YYYY-MM");
  const { baseMonthStart, baseMonthLastDay } = monthBounds(resolvedMonth);

  // 대상 시즌 결정 — 지정됐으면 그것, 아니면 기준 월에 걸치는 ACTIVE 전부.
  //
  // ⚠️ **두 분기 모두 `team_id`로 좁힌다.** 안 좁히면 ① 관리자가 다른 팀의 `evt_id`를 넘겨
  // 그 팀 시즌을 평가시킬 수 있고(이 파일이 `"use server"` 밖인 이유가 무색해진다)
  // ② 크론이 `batch_job_mst.team_id`를 무시한 채 **모든 팀**의 ACTIVE 시즌을 돌아
  // 남의 팀 멤버에게 칭호를 주고 알림까지 보낸다.
  let seasons: { evt_id: string; evt_nm: string }[];
  if (evtId) {
    const { data } = await db
      .from("evt_team_mst")
      .select("evt_id, evt_nm")
      .eq("evt_id", evtId)
      .eq("team_id", ctx.teamId)
      .maybeSingle();
    if (!data) throw new Error(`이벤트를 찾을 수 없습니다: ${evtId}`);
    seasons = [data];
  } else {
    const { data, error } = await db
      .from("evt_team_mst")
      .select("evt_id, evt_nm")
      .eq("team_id", ctx.teamId)
      .eq("stts_enm", "ACTIVE")
      .lte("stt_dt", baseMonthLastDay)
      .gte("end_dt", baseMonthStart)
      .order("stt_dt", { ascending: false });
    if (error) throw new Error(`활성 시즌 조회 실패: ${error.message}`);
    seasons = data ?? [];
  }

  if (!seasons.length) {
    return {
      msg: `기준 월(${resolvedMonth})에 해당하는 활성 마일리지런 시즌이 없습니다.`,
      metrics: [
        { label: "시즌", value: 0 },
        { label: "평가", value: 0 },
        { label: "부여", value: 0 },
      ],
      changedCount: 0,
      changes: [],
      warnings: null,
    };
  }

  const outcomes: SeasonOutcome[] = [];
  for (const s of seasons) {
    outcomes.push(await runOneSeason(db, ctx.teamId, s.evt_id, s.evt_nm, resolvedMonth));
  }

  const evaluated = outcomes.reduce((n, o) => n + o.evaluated, 0);
  const granted = outcomes.reduce((n, o) => n + o.granted, 0);
  const notes = outcomes.filter((o) => o.note).map((o) => `${o.evtNm}: ${o.note}`);
  const allGrants = outcomes.flatMap((o) => o.grants);

  // 누가 무슨 칭호를 받았는지 — 이름은 여기서 한 번에 붙인다(엔진은 mem_id만 안다).
  const grantChanges: BatchChange[] = [];
  if (allGrants.length) {
    const { data: memRows } = await db
      .from("mem_mst")
      .select("mem_id, mem_nm")
      .in("mem_id", [...new Set(allGrants.map((g) => g.memId))]);
    const nameById = new Map((memRows ?? []).map((r) => [r.mem_id, r.mem_nm]));
    for (const g of allGrants) {
      grantChanges.push({ memNm: nameById.get(g.memId) ?? g.memId, what: `'${g.ttlNm}' 칭호 획득` });
    }
  }

  const capped = capChanges(grantChanges, notes);
  return {
    msg: `${seasons.length}개 시즌 · ${evaluated}명 평가 완료, ${granted}개 칭호 부여 (기준 월: ${resolvedMonth})`,
    metrics: [
      { label: "시즌", value: seasons.length },
      { label: "평가", value: evaluated },
      { label: "부여", value: granted },
    ],
    // 건수의 정본은 granted다 — grants는 스냅샷에 memId가 없는 행이 빠질 수 있어 더 짧을 수 있다.
    changedCount: granted,
    changes: capped.changes,
    warnings: capped.warnings.length ? capped.warnings : null,
  };
}
