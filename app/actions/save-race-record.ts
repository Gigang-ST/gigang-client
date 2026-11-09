"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";

import { toRankingEvtCd } from "@/lib/comp-evt-type";
import { withActive, withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import {
  insertRaceRecordCore,
  shouldInvalidateRecordsCacheOnDelete,
  shouldInvalidateRecordsCacheOnSave,
  type RaceRecordOwner,
  type SaveRaceRecordInput,
} from "@/lib/race-record";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";
import { syncPersonRecordToOtherTeams } from "@/lib/records-revalidate";

export type { SaveRaceRecordInput };

/**
 * 기록의 종목을 랭킹 RPC가 쓰는 코드로 바꾼다 — 철인 `FULL`은 `TRIATHLON_FULL`, 하이록스 `OPEN`은 `HYROX_OPEN`.
 *
 * 저장된 코드 그대로 RPC 결과와 대조하면 철인 기록을 마라톤 풀 후보와 견주게 되어,
 * 13시간대 기록이 TOP10 밖이라며 캐시를 안 털고 킹 칸이 24시간 비어 있는다(#581).
 */
function rankingEvtCdOf(
  target: {
    comp_evt_cfg: { comp_evt_type: string } | { comp_evt_type: string }[] | null;
    comp_mst: { comp_sprt_cd: string | null } | { comp_sprt_cd: string | null }[] | null;
  },
): string {
  const evtCfg = Array.isArray(target.comp_evt_cfg) ? target.comp_evt_cfg[0] : target.comp_evt_cfg;
  const comp = Array.isArray(target.comp_mst) ? target.comp_mst[0] : target.comp_mst;
  const evtType = evtCfg?.comp_evt_type ?? "";
  return evtType ? toRankingEvtCd(comp?.comp_sprt_cd, evtType) : "";
}


/**
 * 기록 한 건 저장 + 랭킹 캐시 판정 + 칭호 평가.
 *
 * 본인 저장(`saveRaceRecord`)과 관리자 대리 등록(`adminSaveRaceRecord`)이 **같은 길**을 탄다 —
 * 갈라 두면 종목 정규화·철인 코드 변환(#581)·캐시 무효화 판정 중 하나를 한쪽만 빠뜨린다.
 * 둘이 다른 건 INSERT 클라이언트뿐이다: 본인은 세션 클라이언트(RLS `rec_race_hist_insert_own`),
 * 관리자는 남의 mem_id 로 써야 해서 service role.
 * 포인트는 DB 트리거가 적립하므로 여기서 할 일이 없다.
 * 저장·캐시 판정 코어는 `lib/race-record.ts` — 운영 MCP(`log_hyrox_record`)도 같은 코어를 탄다.
 */
async function insertRaceRecord(
  db: SupabaseClient<Database>,
  owner: RaceRecordOwner,
  input: SaveRaceRecordInput,
) {
  const { teamId } = await getRequestTeamContext();
  const result = await insertRaceRecordCore(db, createAdminClient(), teamId, owner, input);
  if (!result.ok) return { ok: false as const, message: result.message };
  if (result.shouldInvalidate) revalidateTag(`records:${teamId}`, "max");

  const grantedTitles = await evaluateAndGrantTitles({
    trigger: "race_record", teamId, teamMemId: owner.teamMemId,
  }).catch((e) => { console.error("[title-engine] race_record 평가 실패", e); return [] as string[]; });

  // 기록은 사람 것 — 이 사람이 속한 다른 팀 전당·칭호에도 반영(응답 밖에서)
  after(() => syncPersonRecordToOtherTeams(owner.memId, teamId, { evaluateTitles: true }));

  return { ok: true as const, message: null, grantedTitles };
}

export async function saveRaceRecord(input: SaveRaceRecordInput) {
  return withActive(async ({ member, supabase }) =>
    insertRaceRecord(
      supabase,
      { memId: member.id, teamMemId: member.team_mem_id, gender: member.gender ?? null },
      input,
    ),
  );
}

/**
 * 관리자가 **특정 회원의** 대회 기록을 대신 등록한다(관리자 > 기록 관리).
 *
 * 회원들이 직접 등록을 잘 안 해서 운영진이 채워 넣는 길이다. 대상은 `memberId` 로 받되
 * **이 팀 소속(vers=0)인지 서버가 다시 확인한다** — 아무 mem_id 에나 기록을 붙일 수 없게.
 *
 * 대상은 **활동 중(active) 회원만** — 화면의 회원 목록과 같은 기준이다(목록만 거르면
 * memberId 를 직접 넘겨 비활성·탈퇴 회원에게도 붙일 수 있다).
 * 칭호가 붙으면 엔진이 그 회원에게 알림을 보낸다
 * (관리자 화면엔 띄우지 않는다 — 관리자가 받은 칭호가 아니다).
 */
export async function adminSaveRaceRecord(memberId: string, input: SaveRaceRecordInput) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const admin = createAdminClient();
    const [{ data: rel }, { data: mst }] = await Promise.all([
      admin
        .from("team_mem_rel")
        .select("team_mem_id")
        .eq("team_id", teamId)
        .eq("mem_id", memberId)
        .eq("mem_st_cd", "active")
        .eq("vers", 0)
        .eq("del_yn", false)
        .maybeSingle(),
      // 성별은 랭킹 캐시 판정(남/여 TOP10)에만 쓴다
      admin
        .from("mem_mst")
        .select("gdr_enm")
        .eq("mem_id", memberId)
        .eq("vers", 0)
        .eq("del_yn", false)
        .maybeSingle(),
    ]);
    if (!rel || !mst) return { ok: false as const, message: "활동 중인 크루 회원이 아닙니다." };

    const result = await insertRaceRecord(
      admin,
      { memId: memberId, teamMemId: rel.team_mem_id, gender: mst.gdr_enm ?? null },
      input,
    );
    if (result.ok) revalidatePath("/admin/records");
    return result;
  });
}

export async function updateRaceRecord(recordId: string, recordTimeSec: number) {
  return withActive(async ({ member, supabase }) => {
    const { data: target, error: fetchError } = await supabase
      .from("rec_race_hist")
      .select("race_result_id, comp_evt_cfg(comp_evt_type), comp_mst(comp_sprt_cd)")
      .eq("race_result_id", recordId)
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();

    if (fetchError || !target) return { ok: false as const, message: "대상 기록을 찾을 수 없습니다." };

    const { error } = await supabase
      .from("rec_race_hist")
      .update({ rec_time_sec: recordTimeSec })
      .eq("race_result_id", recordId)
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false);
    if (error) return { ok: false as const, message: "수정에 실패했습니다." };

    const eventType = rankingEvtCdOf(target);

    if (eventType) {
      const { teamId } = await getRequestTeamContext();
      const shouldInvalidate = await shouldInvalidateRecordsCacheOnSave(createAdminClient(), {
        teamId, eventType, recordTimeSec, memberId: member.id, memberGender: member.gender ?? null,
      });
      if (shouldInvalidate) revalidateTag(`records:${teamId}`, "max");
      // 기록은 사람 것 — 다른 팀 전당도 턴다
      await syncPersonRecordToOtherTeams(member.id, teamId);
    }

    return { ok: true as const, message: null };
  });
}

export async function deleteRaceRecord(recordId: string) {
  return withActive(async ({ member, supabase }) => {
    const { data: target, error: fetchError } = await supabase
      .from("rec_race_hist")
      .select("race_result_id, comp_evt_cfg(comp_evt_type), comp_mst(comp_sprt_cd)")
      .eq("race_result_id", recordId)
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();

    if (fetchError || !target) return { ok: false as const, message: "대상 기록을 찾을 수 없습니다." };

    const { error } = await supabase
      .from("rec_race_hist")
      .delete()
      .eq("race_result_id", recordId)
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false);
    if (error) return { ok: false as const, message: "삭제에 실패했습니다." };

    const eventType = rankingEvtCdOf(target);

    if (eventType) {
      const { teamId } = await getRequestTeamContext();
      const shouldInvalidate = await shouldInvalidateRecordsCacheOnDelete(createAdminClient(), {
        teamId, eventType, memberId: member.id, memberGender: member.gender ?? null,
      });
      if (shouldInvalidate) revalidateTag(`records:${teamId}`, "max");
      // 기록은 사람 것 — 다른 팀 전당도 턴다
      await syncPersonRecordToOtherTeams(member.id, teamId);
    }

    return { ok: true as const, message: null };
  });
}
