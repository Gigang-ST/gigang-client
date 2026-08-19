import type { CompetitionRegistration } from "@/components/races/types";

/**
 * 대회 참가 등록(`comp_reg_rel`) 행을 화면 모델로 눕히는 곳.
 *
 * **이 변환이 한 곳에 모여 있어야 하는 이유**: 참가 신청 화면은 등록 맵이 있으면 "수정",
 * 없으면 "신규 신청"으로 갈린다(§CompetitionDetailDialog). 맵이 비면 이미 신청한 사람이
 * 신규 INSERT를 쏘고 `uk_comp_reg_rel_team_comp_mem_vers`(23505)에 걸려 **"신청에
 * 실패했습니다"만 뜨는 막다른 길**이 된다 — 취소 버튼은 아예 렌더되지 않아 되돌릴 길도 없다.
 * 실제로 prd에서 터졌다. 그래서 맵을 만드는 경로가 늘어나도 변환은 여기 하나만 쓴다.
 */

/** PostgREST 임베드는 관계(1:1/1:N)에 따라 객체와 배열이 섞여 오므로 한 곳에서 눕힌다. */
function one<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

type EvtEmbed = { comp_evt_type: string | null };
type PlanEmbed = { comp_id: string };

/** 등록 한 건 — 어느 조회 경로든 최소 이 필드는 실어야 수정·취소가 성립한다. */
export type RegistrationRow = {
  comp_reg_id: string;
  mem_id: string;
  prt_role_cd: string;
  crt_at: string;
  comp_evt_cfg?: EvtEmbed | EvtEmbed[] | null;
};

/** 대회 식별자를 행이 직접 들고 오는 경우(`team_comp_plan_rel!inner(comp_id)`) */
export type RegistrationRowWithPlan = RegistrationRow & {
  team_comp_plan_rel?: PlanEmbed | PlanEmbed[] | null;
};

function toRegistration(
  row: RegistrationRow,
  competitionId: string,
): CompetitionRegistration {
  return {
    id: row.comp_reg_id,
    competition_id: competitionId,
    member_id: row.mem_id,
    role: row.prt_role_cd as CompetitionRegistration["role"],
    event_type: one(row.comp_evt_cfg)?.comp_evt_type?.toUpperCase() ?? null,
    created_at: row.crt_at,
  };
}

/**
 * 내 등록 목록 → `{ [comp_id]: 등록 }` 맵.
 *
 * `team_comp_plan_rel`이 안 실려 온 행은 **어느 대회 것인지 알 수 없으므로 조용히 건너뛴다**
 * (예전엔 `plan.comp_id`를 그냥 읽어 TypeError로 맵 구성 전체가 날아갔다).
 */
export function buildRegistrationMap(
  rows: RegistrationRowWithPlan[] | null | undefined,
): Record<string, CompetitionRegistration> {
  const map: Record<string, CompetitionRegistration> = {};
  (rows ?? []).forEach((row) => {
    const compId = one(row.team_comp_plan_rel)?.comp_id;
    if (!compId || !row.comp_reg_id) return;
    map[compId] = toRegistration(row, compId);
  });
  return map;
}

/**
 * 한 대회의 등록 목록에서 **내 등록**을 집어낸다.
 *
 * 상세 다이얼로그가 참가자 목록을 어차피 한 번 읽으므로, 부모가 넘긴 등록 맵이 비어 있어도
 * 여기서 되찾아 "수정/취소" 화면으로 복구한다. 추가 요청 없이 막다른 길을 없애는 자리다.
 */
export function findMyRegistration(
  rows: RegistrationRow[] | null | undefined,
  memberId: string | undefined,
  competitionId: string,
): CompetitionRegistration | undefined {
  if (!memberId) return undefined;
  const mine = (rows ?? []).find(
    (row) => row.mem_id === memberId && Boolean(row.comp_reg_id),
  );
  return mine ? toRegistration(mine, competitionId) : undefined;
}
