"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath, revalidateTag } from "next/cache";

import { compEvtTypeContainsHangul, toRankingEvtCd } from "@/lib/comp-evt-type";
import { withActive, withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import {
  normalizeCompEvtType,
  resolveCompEvtIdForRaceRecord,
} from "@/lib/server/comp-evt-cfg";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";

export type SaveRaceRecordInput = {
  competitionId: string;
  registrationCompEvtId?: string | null;
  competitionTitle: string;
  competitionDate: string;
  eventType: string;
  totalSeconds: number;
  swimSeconds: number | null;
  bikeSeconds: number | null;
  runSeconds: number | null;
};

const MARATHON_EVENTS = new Set(["FULL", "HALF", "10K"]);

type TeamRaceRow = {
  mem_id: string;
  evt_cd: string | null;
  rec_time_sec: number;
  gdr_enm: string | null;
};

function pickRankingCandidates(
  rows: TeamRaceRow[],
  eventType: string,
  memberGender: string | null,
) {
  const normalizedEventType = normalizeCompEvtType(eventType);
  const isMarathon = MARATHON_EVENTS.has(normalizedEventType);
  const normalizedGender =
    memberGender === "female" ? "female" : memberGender === "male" ? "male" : null;

  const byMemberBest = new Map<string, TeamRaceRow>();
  for (const row of rows) {
    const evt = row.evt_cd?.toUpperCase() ?? "";
    if (!evt) continue;
    if (evt !== normalizedEventType) continue;
    if (isMarathon && normalizedGender && row.gdr_enm !== normalizedGender) continue;

    const prev = byMemberBest.get(row.mem_id);
    if (!prev || row.rec_time_sec < prev.rec_time_sec) {
      byMemberBest.set(row.mem_id, row);
    }
  }

  return Array.from(byMemberBest.values()).sort(
    (a, b) => a.rec_time_sec - b.rec_time_sec,
  );
}

async function getTeamRaceRows(teamId: string) {
  const admin = createAdminClient();
  const { data } = await admin.rpc("get_public_team_race_rankings", { p_team_id: teamId });
  return (data ?? []) as TeamRaceRow[];
}

/**
 * 기록의 종목을 랭킹 RPC가 쓰는 코드로 바꾼다 — 철인 `FULL`은 `TRIATHLON_FULL`.
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

async function shouldInvalidateRecordsCacheOnSave(params: {
  teamId: string;
  eventType: string;
  recordTimeSec: number;
  memberId: string;
  memberGender: string | null;
}) {
  const { teamId, eventType, recordTimeSec, memberId, memberGender } = params;
  const rows = await getTeamRaceRows(teamId);
  const candidates = pickRankingCandidates(rows, eventType, memberGender);

  if (candidates.length < 10) return true;
  if (candidates.slice(0, 10).some((row) => row.mem_id === memberId)) return true;

  const cutoff = candidates.map((row) => row.rec_time_sec)[9];
  if (typeof cutoff !== "number") return true;
  return recordTimeSec <= cutoff;
}

async function shouldInvalidateRecordsCacheOnDelete(params: {
  teamId: string;
  eventType: string;
  memberId: string;
  memberGender: string | null;
}) {
  const { teamId, eventType, memberId, memberGender } = params;
  const rows = await getTeamRaceRows(teamId);
  const candidates = pickRankingCandidates(rows, eventType, memberGender);
  return candidates.slice(0, 10).some((row) => row.mem_id === memberId);
}

/** 기록을 남길 대상 회원 — 본인 저장이면 세션 회원, 관리자 등록이면 고른 회원 */
type RaceRecordOwner = {
  memId: string;
  teamMemId: string;
  gender: string | null;
};

/**
 * 기록 한 건 저장 + 랭킹 캐시 판정 + 칭호 평가.
 *
 * 본인 저장(`saveRaceRecord`)과 관리자 대리 등록(`adminSaveRaceRecord`)이 **같은 길**을 탄다 —
 * 갈라 두면 종목 정규화·철인 코드 변환(#581)·캐시 무효화 판정 중 하나를 한쪽만 빠뜨린다.
 * 둘이 다른 건 INSERT 클라이언트뿐이다: 본인은 세션 클라이언트(RLS `rec_race_hist_insert_own`),
 * 관리자는 남의 mem_id 로 써야 해서 service role.
 * 포인트는 DB 트리거가 적립하므로 여기서 할 일이 없다.
 */
async function insertRaceRecord(
  db: SupabaseClient<Database>,
  owner: RaceRecordOwner,
  input: SaveRaceRecordInput,
) {
  if (compEvtTypeContainsHangul(input.eventType)) {
    return { ok: false as const, message: "종목은 한글을 사용할 수 없습니다. 영문·숫자로 입력해 주세요. (예: HALF, 10K)" };
  }
  const normalizedEventType = normalizeCompEvtType(input.eventType);
  const { teamId } = await getRequestTeamContext();

  const admin = createAdminClient();
  const resolved = await resolveCompEvtIdForRaceRecord(
    admin, input.competitionId, normalizedEventType, input.registrationCompEvtId,
  );
  if (!resolved.ok) return { ok: false as const, message: resolved.message };

  const { error: insertError } = await db.from("rec_race_hist").insert({
    mem_id: owner.memId, comp_id: input.competitionId, comp_evt_id: resolved.compEvtId,
    rec_time_sec: input.totalSeconds, race_nm: input.competitionTitle, race_dt: input.competitionDate,
    swim_time_sec: input.swimSeconds, bike_time_sec: input.bikeSeconds, run_time_sec: input.runSeconds,
    rec_src_cd: "manual", vers: 0, del_yn: false,
  });

  if (insertError) {
    if (insertError.code === "23505") return { ok: false as const, message: "동일 대회·종목·날짜·대회명의 기록이 이미 있습니다." };
    return { ok: false as const, message: "저장에 실패했습니다. 다시 시도해 주세요." };
  }

  const { data: comp, error: compError } = await admin
    .from("comp_mst")
    .select("comp_sprt_cd")
    .eq("comp_id", input.competitionId)
    .maybeSingle();
  // 못 읽으면 철인을 못 가려 마라톤 코드로 판정한다 — 저장은 이미 끝났으니 막지 않고 흔적만 남긴다
  if (compError) console.error("[save-race-record] 대회 스포츠 조회 실패", compError);
  const shouldInvalidate = await shouldInvalidateRecordsCacheOnSave({
    teamId, eventType: toRankingEvtCd(comp?.comp_sprt_cd, normalizedEventType),
    recordTimeSec: input.totalSeconds, memberId: owner.memId, memberGender: owner.gender,
  });
  if (shouldInvalidate) revalidateTag(`records:${teamId}`, "max");

  const grantedTitles = await evaluateAndGrantTitles({
    trigger: "race_record", teamId, teamMemId: owner.teamMemId,
  }).catch((e) => { console.error("[title-engine] race_record 평가 실패", e); return [] as string[]; });

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
      const shouldInvalidate = await shouldInvalidateRecordsCacheOnSave({
        teamId, eventType, recordTimeSec, memberId: member.id, memberGender: member.gender ?? null,
      });
      if (shouldInvalidate) revalidateTag(`records:${teamId}`, "max");
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
      const shouldInvalidate = await shouldInvalidateRecordsCacheOnDelete({
        teamId, eventType, memberId: member.id, memberGender: member.gender ?? null,
      });
      if (shouldInvalidate) revalidateTag(`records:${teamId}`, "max");
    }

    return { ok: true as const, message: null };
  });
}
