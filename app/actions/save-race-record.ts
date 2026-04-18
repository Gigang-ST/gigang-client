"use server";

import { revalidateTag } from "next/cache";

import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import {
  normalizeCompEvtType,
  resolveCompEvtIdForRaceRecord,
} from "@/lib/server/comp-evt-cfg";
import { createAdminClient } from "@/lib/supabase/admin";

type SaveRaceRecordInput = {
  competitionId: string;
  /** 참가 신청 행의 comp_evt_id(있으면 검증 후 사용, 없으면 종목명으로 조회·생성) */
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
  const { data } = await admin.rpc("get_public_team_race_rankings", {
    p_team_id: teamId,
  });
  return (data ?? []) as TeamRaceRow[];
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

  const cutoff = candidates
    .map((row) => row.rec_time_sec)[9];

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

export async function saveRaceRecord(input: SaveRaceRecordInput) {
  const { member, supabase } = await getCurrentMember();
  if (!member) return { ok: false as const, message: "로그인이 필요합니다." };

  const { teamId } = await getRequestTeamContext();
  const normalizedEventType = normalizeCompEvtType(input.eventType);

  const admin = createAdminClient();
  const resolved = await resolveCompEvtIdForRaceRecord(
    admin,
    input.competitionId,
    normalizedEventType,
    input.registrationCompEvtId,
  );
  if (!resolved.ok) {
    return { ok: false as const, message: resolved.message };
  }

  // 기록만 저장한다. 팀 대회 참가(comp_reg_rel / team_comp_plan_rel)와는 연동하지 않는다.

  const { error: insertError } = await supabase.from("rec_race_hist").insert({
    mem_id: member.id,
    comp_id: input.competitionId,
    comp_evt_id: resolved.compEvtId,
    rec_time_sec: input.totalSeconds,
    race_nm: input.competitionTitle,
    race_dt: input.competitionDate,
    swim_time_sec: input.swimSeconds,
    bike_time_sec: input.bikeSeconds,
    run_time_sec: input.runSeconds,
    rec_src_cd: "manual",
    vers: 0,
    del_yn: false,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        ok: false as const,
        message: "동일 대회·종목·날짜·대회명의 기록이 이미 있습니다.",
      };
    }
    return { ok: false as const, message: "저장에 실패했습니다. 다시 시도해 주세요." };
  }

  const shouldInvalidate = await shouldInvalidateRecordsCacheOnSave({
    teamId,
    eventType: normalizedEventType,
    recordTimeSec: input.totalSeconds,
    memberId: member.id,
    memberGender: member.gender ?? null,
  });

  if (shouldInvalidate) {
    revalidateTag(`records:${teamId}`, "max");
  }

  return { ok: true as const, message: null };
}

export async function updateRaceRecord(
  recordId: string,
  recordTimeSec: number,
) {
  const { member, supabase } = await getCurrentMember();
  if (!member) return { ok: false as const, message: "로그인이 필요합니다." };

  const { data: target, error: fetchError } = await supabase
    .from("rec_race_hist")
    .select("race_result_id, comp_evt_cfg(comp_evt_type)")
    .eq("race_result_id", recordId)
    .eq("mem_id", member.id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (fetchError || !target) {
    return { ok: false as const, message: "대상 기록을 찾을 수 없습니다." };
  }

  const { error } = await supabase
    .from("rec_race_hist")
    .update({ rec_time_sec: recordTimeSec })
    .eq("race_result_id", recordId)
    .eq("mem_id", member.id)
    .eq("vers", 0)
    .eq("del_yn", false);
  if (error) return { ok: false as const, message: "수정에 실패했습니다." };

  const eventType =
    (Array.isArray(target.comp_evt_cfg)
      ? target.comp_evt_cfg[0]
      : target.comp_evt_cfg)?.comp_evt_type ?? "";

  if (eventType) {
    const { teamId } = await getRequestTeamContext();
    const shouldInvalidate = await shouldInvalidateRecordsCacheOnSave({
      teamId,
      eventType,
      recordTimeSec,
      memberId: member.id,
      memberGender: member.gender ?? null,
    });
    if (shouldInvalidate) {
      revalidateTag(`records:${teamId}`, "max");
    }
  }

  return { ok: true as const, message: null };
}

export async function deleteRaceRecord(recordId: string) {
  const { member, supabase } = await getCurrentMember();
  if (!member) return { ok: false as const, message: "로그인이 필요합니다." };

  const { data: target, error: fetchError } = await supabase
    .from("rec_race_hist")
    .select("race_result_id, comp_evt_cfg(comp_evt_type)")
    .eq("race_result_id", recordId)
    .eq("mem_id", member.id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (fetchError || !target) {
    return { ok: false as const, message: "대상 기록을 찾을 수 없습니다." };
  }

  const { error } = await supabase
    .from("rec_race_hist")
    .delete()
    .eq("race_result_id", recordId)
    .eq("mem_id", member.id)
    .eq("vers", 0)
    .eq("del_yn", false);
  if (error) return { ok: false as const, message: "삭제에 실패했습니다." };

  const eventType =
    (Array.isArray(target.comp_evt_cfg)
      ? target.comp_evt_cfg[0]
      : target.comp_evt_cfg)?.comp_evt_type ?? "";

  if (eventType) {
    const { teamId } = await getRequestTeamContext();
    const shouldInvalidate = await shouldInvalidateRecordsCacheOnDelete({
      teamId,
      eventType,
      memberId: member.id,
      memberGender: member.gender ?? null,
    });
    if (shouldInvalidate) {
      revalidateTag(`records:${teamId}`, "max");
    }
  }

  return { ok: true as const, message: null };
}
