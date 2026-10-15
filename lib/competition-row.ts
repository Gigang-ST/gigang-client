import type { Competition } from "@/components/races/types";
import { toCompEvtTypes } from "@/lib/comp-evt-type";

/**
 * 대회 객체(`Competition`)를 만들 때 `comp_mst`에서 읽는 컬럼. 종목은 경로마다 따로 붙인다
 * (직접 조회는 `comp_evt_cfg(comp_evt_type)` 임베드, RPC는 `comp_evt_types`).
 *
 * `short_id`·`crt_by`가 여기 묶여 있는 게 핵심이다 — 하나라도 빠지면 그 경로로 연 상세에서
 * 공유 링크가 uuid로 나가고, 만든 사람이 자기 대회의 수정 버튼을 못 본다.
 */
export const COMPETITION_COLUMNS =
  "comp_id, short_id, crt_by, ext_id, comp_sprt_cd, comp_nm, stt_dt, end_dt, loc_nm, src_url";

/** 직접 조회용 select — `COMPETITION_COLUMNS` + 종목 임베드 */
export const COMPETITION_SELECT = `${COMPETITION_COLUMNS}, comp_evt_cfg(comp_evt_type)` as const;

type CompetitionBaseRow = {
  comp_id: string;
  short_id: string | null;
  crt_by: string | null;
  ext_id: string | null;
  comp_sprt_cd: string | null;
  comp_nm: string;
  stt_dt: string;
  end_dt: string | null;
  loc_nm: string | null;
  src_url: string | null;
};

/** 직접 조회(`COMPETITION_SELECT`) 행 또는 RPC `get_public_team_competitions` 행 */
export type CompetitionRow = CompetitionBaseRow &
  (
    | { comp_evt_cfg: { comp_evt_type: string | null }[] | null }
    | { comp_evt_types: (string | null)[] | null }
  );

/**
 * 조회 행 → 대회 객체. 대회 목록·달력·지난 대회·대회 생성이 같은 `Competition`을 각자 손으로
 * 만들던 걸 한 곳으로 모았다 — 그 사이에 지난 기강 대회만 `short_id`·`crt_by`를 빠뜨리고 있었다.
 */
export function toCompetition(row: CompetitionRow): Competition {
  const rawEventTypes = "comp_evt_cfg" in row ? row.comp_evt_cfg : row.comp_evt_types;
  return {
    id: row.comp_id,
    short_id: row.short_id ?? null,
    crt_by: row.crt_by ?? null,
    external_id: row.ext_id ?? "",
    sport: row.comp_sprt_cd ?? null,
    title: row.comp_nm,
    start_date: row.stt_dt,
    end_date: row.end_dt ?? null,
    location: row.loc_nm ?? null,
    event_types: toCompEvtTypes(rawEventTypes, row.comp_sprt_cd),
    source_url: row.src_url ?? null,
  };
}
