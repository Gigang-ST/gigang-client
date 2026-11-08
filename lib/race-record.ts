/**
 * 대회 기록 저장 코어 — 서버 액션(`app/actions/save-race-record.ts`)과 운영 MCP(`log_hyrox_record`)가 공유한다.
 *
 * MCP 요청은 Supabase 세션 쿠키가 없어 서버 액션을 그대로 부를 수 없다(AGENTS.md §운영 MCP). 그래서
 * **클라이언트·팀을 주입받는** 도메인 로직을 여기 두고, 각 경로는 신원 해석과 `next/*` 부수효과
 * (캐시 태그 무효화·칭호 평가)만 맡는다. 이 파일엔 `next/*` 를 넣지 않는다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { compEvtTypeContainsHangul, toRankingEvtCd } from "@/lib/comp-evt-type";
import { serializeHyroxSplits } from "@/lib/hyrox";
import { normalizeCompEvtType, resolveCompEvtIdForRaceRecord } from "@/lib/server/comp-evt-cfg";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

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
  /** 하이록스 스테이션 구간 기록 `{스테이션코드: 초|null}`. 하이록스가 아니면 비운다 */
  stationSplits?: Record<string, number | null> | null;
};

/** 기록을 남길 대상 회원 — 본인 저장이면 세션 회원, 관리자 등록이면 고른 회원 */
export type RaceRecordOwner = {
  memId: string;
  teamMemId: string;
  gender: string | null;
};

/**
 * 남/여 판이 갈리는 랭킹 코드 — 이 종목은 같은 성별끼리만 TOP10 을 견준다.
 * 성별을 섞어 견주면 여자 판에 새 기록이 들어와도 "TOP10 밖"으로 보고 캐시를 안 턴다.
 */
const GENDER_SPLIT_EVENTS = new Set(["FULL", "HALF", "10K", "HYROX_OPEN", "HYROX_PRO"]);

type TeamRaceRow = {
  mem_id: string;
  evt_cd: string | null;
  rec_time_sec: number;
  gdr_enm: string | null;
};

function pickRankingCandidates(rows: TeamRaceRow[], eventType: string, memberGender: string | null) {
  const normalizedEventType = normalizeCompEvtType(eventType);
  const splitByGender = GENDER_SPLIT_EVENTS.has(normalizedEventType);
  const normalizedGender =
    memberGender === "female" ? "female" : memberGender === "male" ? "male" : null;

  const byMemberBest = new Map<string, TeamRaceRow>();
  for (const row of rows) {
    const evt = row.evt_cd?.toUpperCase() ?? "";
    if (!evt) continue;
    if (evt !== normalizedEventType) continue;
    if (splitByGender && normalizedGender && row.gdr_enm !== normalizedGender) continue;

    const prev = byMemberBest.get(row.mem_id);
    if (!prev || row.rec_time_sec < prev.rec_time_sec) {
      byMemberBest.set(row.mem_id, row);
    }
  }

  return Array.from(byMemberBest.values()).sort((a, b) => a.rec_time_sec - b.rec_time_sec);
}

async function getTeamRaceRows(admin: Db, teamId: string) {
  const { data } = await admin.rpc("get_public_team_race_rankings", { p_team_id: teamId });
  return (data ?? []) as TeamRaceRow[];
}

/**
 * 저장·수정한 기록이 전당 캐시를 털 만한가 — 그 판 TOP10 안에 들거나 이미 TOP10 인 사람이면 턴다.
 *
 * @returns 털어야 하면 `true`(후보가 10명 미만이면 늘 `true`)
 */
export async function shouldInvalidateRecordsCacheOnSave(
  admin: Db,
  params: {
    teamId: string;
    eventType: string;
    recordTimeSec: number;
    memberId: string;
    memberGender: string | null;
  },
): Promise<boolean> {
  const { teamId, eventType, recordTimeSec, memberId, memberGender } = params;
  const rows = await getTeamRaceRows(admin, teamId);
  const candidates = pickRankingCandidates(rows, eventType, memberGender);

  if (candidates.length < 10) return true;
  if (candidates.slice(0, 10).some((row) => row.mem_id === memberId)) return true;

  const cutoff = candidates.map((row) => row.rec_time_sec)[9];
  if (typeof cutoff !== "number") return true;
  return recordTimeSec <= cutoff;
}

/**
 * 지운 기록이 전당 캐시를 털 만한가 — 지운 사람이 그 판 TOP10 이었으면 턴다.
 *
 * @returns 털어야 하면 `true`
 */
export async function shouldInvalidateRecordsCacheOnDelete(
  admin: Db,
  params: { teamId: string; eventType: string; memberId: string; memberGender: string | null },
): Promise<boolean> {
  const { teamId, eventType, memberId, memberGender } = params;
  const rows = await getTeamRaceRows(admin, teamId);
  const candidates = pickRankingCandidates(rows, eventType, memberGender);
  return candidates.slice(0, 10).some((row) => row.mem_id === memberId);
}

export type InsertRaceRecordResult =
  | { ok: false; message: string }
  | {
      ok: true;
      /** 전당 캐시(`records:{teamId}`)를 털어야 하는가 — 호출부가 `revalidateTag` 한다 */
      shouldInvalidate: boolean;
    };

/**
 * 기록 한 건 저장 + 랭킹 캐시 판정.
 *
 * 본인 저장·관리자 대리 등록·MCP 가 **같은 길**을 탄다 — 갈라 두면 종목 정규화·철인/하이록스 코드 변환
 * (#581·#349)·캐시 판정 중 하나를 한쪽만 빠뜨린다. 다른 건 INSERT 클라이언트뿐이다: 본인은 세션
 * 클라이언트(RLS `rec_race_hist_insert_own`), 관리자·MCP 는 service role.
 * 포인트는 DB 트리거가 적립하고, 칭호 평가·캐시 무효화는 `next/*` 라 호출부가 한다.
 *
 * @param db INSERT 를 실행할 클라이언트
 * @param admin 대회 종목 해석·랭킹 조회용 service role 클라이언트
 * @param teamId 기록 주인의 팀(캐시 판정 범위)
 * @param owner 기록 주인
 * @param input 저장할 값
 * @returns 실패 사유 또는 저장 결과
 */
export async function insertRaceRecordCore(
  db: Db,
  admin: Db,
  teamId: string,
  owner: RaceRecordOwner,
  input: SaveRaceRecordInput,
): Promise<InsertRaceRecordResult> {
  if (compEvtTypeContainsHangul(input.eventType)) {
    return { ok: false, message: "종목은 한글을 사용할 수 없습니다. 영문·숫자로 입력해 주세요. (예: HALF, 10K)" };
  }
  const normalizedEventType = normalizeCompEvtType(input.eventType);

  const resolved = await resolveCompEvtIdForRaceRecord(
    admin, input.competitionId, normalizedEventType, input.registrationCompEvtId,
  );
  if (!resolved.ok) return { ok: false, message: resolved.message };

  // RETURNING(.select) 은 붙이지 않는다 — 세션 클라이언트에선 SELECT RLS 까지 걸려, 저장은 됐는데
  // 실패로 읽히는 길이 생긴다.
  const { error: insertError } = await db
    .from("rec_race_hist")
    .insert({
      mem_id: owner.memId, comp_id: input.competitionId, comp_evt_id: resolved.compEvtId,
      rec_time_sec: input.totalSeconds, race_nm: input.competitionTitle, race_dt: input.competitionDate,
      swim_time_sec: input.swimSeconds, bike_time_sec: input.bikeSeconds, run_time_sec: input.runSeconds,
      splits_json: serializeHyroxSplits(input.stationSplits),
      rec_src_cd: "manual", vers: 0, del_yn: false,
    });

  if (insertError) {
    if (insertError.code === "23505") return { ok: false, message: "동일 대회·종목·날짜·대회명의 기록이 이미 있습니다." };
    return { ok: false, message: "저장에 실패했습니다. 다시 시도해 주세요." };
  }

  const { data: comp, error: compError } = await admin
    .from("comp_mst")
    .select("comp_sprt_cd")
    .eq("comp_id", input.competitionId)
    .maybeSingle();
  // 못 읽으면 철인·하이록스를 못 가려 맨 코드로 판정한다 — 저장은 이미 끝났으니 막지 않고 흔적만 남긴다
  if (compError) console.error("[race-record] 대회 스포츠 조회 실패", compError);
  const shouldInvalidate = await shouldInvalidateRecordsCacheOnSave(admin, {
    teamId, eventType: toRankingEvtCd(comp?.comp_sprt_cd, normalizedEventType),
    recordTimeSec: input.totalSeconds, memberId: owner.memId, memberGender: owner.gender,
  });

  return { ok: true, shouldInvalidate };
}
