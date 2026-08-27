/**
 * 모임 참가 신청 코어 — 신청 / 승인 / 반려 / 취소.
 *
 * 설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §5
 *
 * **클라이언트 주입식**이다(AGENTS.md 운영 MCP 규약). 서버 액션은 세션 쿠키로 신원을
 * 풀고, MCP 는 PAT 로 푼다 — 신원 해석과 next/* 부수효과는 각 경로가 맡고, 도메인 로직은
 * 여기 하나를 공유한다.
 *
 * 반환은 예외가 아니라 결과 코드다. "정원 마감"·"이미 처리됨"은 오류가 아니라 화면에
 * 그대로 보여줄 상태이고, 예외로 던지면 호출부가 메시지 문자열을 파싱해 분기하게 된다.
 */

import { dayjs } from "@/lib/dayjs";
import { isPastLockedFor } from "@/lib/past-event";
import type { createUntypedAdminClient } from "@/lib/supabase/admin";

import {
  evaluateJoinConditions,
  type JoinConditionResult,
  type JoinConditionSpec,
} from "./join-condition";

type SupabaseLike = ReturnType<typeof createUntypedAdminClient>;

// ─────────────────────────────────────────────────────────────
// 신청 메모 (입금자명 등)
// ─────────────────────────────────────────────────────────────

export const APPLY_MEMO_MAX_LENGTH = 200;
export const APPLY_MEMO_TOO_LONG_MESSAGE = `신청 메모는 ${APPLY_MEMO_MAX_LENGTH}자 이내로 입력해주세요.`;

export const REVIEW_MEMO_MAX_LENGTH = 500;
export const REVIEW_MEMO_TOO_LONG_MESSAGE = `사유는 ${REVIEW_MEMO_MAX_LENGTH}자 이내로 입력해주세요.`;

type TextResult = { ok: true; value: string | null } | { ok: false; message: string };

/**
 * 자유 입력 텍스트를 정규화·검증한다(`validateCancelReason` 과 같은 태도).
 * 초과분을 잘라내지 않고 거부한다 — 잘림보다 명확하고, DB CHECK 와 상한이 같다.
 */
function validateText(value: string | null | undefined, max: number, tooLong: string): TextResult {
  if (value == null) return { ok: true, value: null };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, message: tooLong };
  return { ok: true, value: trimmed };
}

export const validateApplyMemo = (v?: string | null) =>
  validateText(v, APPLY_MEMO_MAX_LENGTH, APPLY_MEMO_TOO_LONG_MESSAGE);
export const validateReviewMemo = (v?: string | null) =>
  validateText(v, REVIEW_MEMO_MAX_LENGTH, REVIEW_MEMO_TOO_LONG_MESSAGE);

// ─────────────────────────────────────────────────────────────
// 결과 타입
// ─────────────────────────────────────────────────────────────

/**
 * 승인제 모임에서 참석 토글(toggleGatheringAttendance)이 거부될 때의 문구.
 * 클라이언트가 이 메시지를 식별해 "참가 신청" 흐름으로 안내할 수 있도록 상수로 공유한다.
 */
export const APPROVAL_GATHERING_MESSAGE = "이 모임은 참가 신청 후 운영진 승인이 필요해요.";

export type ApplicationFailCode =
  | "not_found"
  | "past_locked"
  | "not_approval_gathering"
  | "condition_unmet"
  | "already_applied"
  | "already_attending"
  | "no_application"
  | "not_pending"
  | "not_active"
  | "full"
  | "forbidden"
  | "invalid_input"
  | "error";

export const APPLICATION_FAIL_MESSAGE: Record<ApplicationFailCode, string> = {
  not_found: "모임을 찾을 수 없습니다.",
  past_locked: "지난 모임은 신청을 변경할 수 없어요.",
  not_approval_gathering: "승인이 필요한 모임이 아니에요.",
  condition_unmet: "참여 조건을 충족하지 않아요.",
  already_applied: "이미 신청했어요.",
  already_attending: "이미 참가가 확정된 모임이에요.",
  no_application: "신청 내역이 없어요.",
  not_pending: "이미 처리된 신청이에요.",
  not_active: "이미 처리된 신청이에요.",
  full: "인원이 마감됐어요.",
  forbidden: "권한이 없습니다.",
  invalid_input: "입력값을 확인해주세요.",
  error: "처리에 실패했습니다.",
};

export type ApplicationFail = {
  ok: false;
  code: ApplicationFailCode;
  message: string;
  /** condition_unmet 일 때만 — 화면이 어떤 조건이 모자란지 그대로 그린다 */
  conditions?: JoinConditionResult;
};

const fail = (code: ApplicationFailCode, message?: string, conditions?: JoinConditionResult): ApplicationFail => ({
  ok: false,
  code,
  message: message ?? APPLICATION_FAIL_MESSAGE[code],
  conditions,
});

/** 알림 발송에 필요한 최소한만 — 코어가 알림을 보내지 않고 호출부에 넘긴다. */
export type GatheringRef = {
  gthr_id: string;
  gthr_nm: string;
  crt_by: string;
  team_id: string;
};

export type ApplicationOk = { ok: true; gathering: GatheringRef };

export type ApplicationResult = ApplicationOk | ApplicationFail;

// ─────────────────────────────────────────────────────────────
// 조회 · 권한
// ─────────────────────────────────────────────────────────────

type GatheringRow = GatheringRef &
  JoinConditionSpec & {
    aprv_req_yn: boolean;
    stt_at: string;
    end_at: string | null;
  };

const GTHR_COLS =
  "gthr_id, gthr_nm, crt_by, team_id, aprv_req_yn, req_attd_cnt, req_attd_months, stt_at, end_at";

/**
 * 모임 조회 + 팀 스코프 검증.
 * team_id 필터는 IDOR 방어다 — gthr_id 는 클라이언트 입력값이라 다른 팀 모임 id 를 밀어 넣을 수 있다.
 */
async function loadGathering(
  admin: SupabaseLike,
  gthrId: string,
  teamId: string,
): Promise<GatheringRow | null> {
  const { data } = await admin
    .from("gthr_mst")
    .select(GTHR_COLS)
    .eq("gthr_id", gthrId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .maybeSingle();
  return (data as GatheringRow | null) ?? null;
}

const toRef = (g: GatheringRow): GatheringRef => ({
  gthr_id: g.gthr_id,
  gthr_nm: g.gthr_nm,
  crt_by: g.crt_by,
  team_id: g.team_id,
});

/**
 * 신청을 심사할 수 있는 사람인가 — **운영진 또는 모임 개설자**(설계 §9-d).
 *
 * 입금 확인은 보통 총무가 하는데 개설자는 다른 사람일 수 있고, 반대로 일반 멤버가 조건부
 * 모임을 열었을 때도 자기 모임은 자기가 받을 수 있어야 한다.
 */
export function canReviewApplications(
  gathering: { crt_by: string },
  actor: { memId: string; isAdmin: boolean },
): boolean {
  return actor.isAdmin || gathering.crt_by === actor.memId;
}

// ─────────────────────────────────────────────────────────────
// 신청
// ─────────────────────────────────────────────────────────────

/**
 * 참가 신청. 참여조건은 **하드 게이트**라 미달이면 여기서 거부한다(설계 §9-a).
 * 버튼을 감추는 건 안내일 뿐이고 gthr_id 만 알면 액션은 직접 호출된다.
 */
export async function applyToGathering(
  admin: SupabaseLike,
  {
    gthrId,
    memId,
    teamId,
    isAdmin,
    memo,
  }: { gthrId: string; memId: string; teamId: string; isAdmin: boolean; memo?: string | null },
): Promise<ApplicationResult> {
  const gathering = await loadGathering(admin, gthrId, teamId);
  if (!gathering) return fail("not_found");
  if (isPastLockedFor(isAdmin, gathering.stt_at, gathering.end_at)) return fail("past_locked");
  if (!gathering.aprv_req_yn) return fail("not_approval_gathering");

  const memoCheck = validateApplyMemo(memo);
  if (!memoCheck.ok) return fail("invalid_input", memoCheck.message);

  // 이미 확정이면 신청이 성립하지 않는다. aply 상태보다 attd_rel 을 먼저 보는 이유는
  // 운영진 대리 추가로 attd_rel 만 생긴 과거 행이 있을 수 있어서다.
  const { data: attending } = await admin
    .from("gthr_attd_rel")
    .select("attd_id")
    .eq("gthr_id", gthrId)
    .eq("mem_id", memId)
    .maybeSingle();
  if (attending) return fail("already_attending");

  const { data: existing } = await admin
    .from("gthr_aply_rel")
    .select("aply_st_cd")
    .eq("gthr_id", gthrId)
    .eq("mem_id", memId)
    .maybeSingle();
  if (existing?.aply_st_cd === "pending") return fail("already_applied");

  const conditions = await evaluateJoinConditions(admin, { spec: gathering, memId, teamId });
  if (!conditions.ok) return fail("condition_unmet", undefined, conditions);

  // 재신청(rejected/canceled → pending)은 같은 행의 UPDATE 다. 이전 심사 흔적을 반드시
  // 지운다 — 안 지우면 새 대기 건 옆에 지난번 반려 사유가 붙어 있다.
  //
  // `crt_at` 도 **다시 찍는다**. 신청 관리 목록은 이 컬럼으로 정렬하고 "M.DD HH:mm 신청"
  // 이라고 적으므로, 안 갱신하면 방금 다시 넣은 신청이 몇 주 전 자리에 끼어 앉아
  // 대기열 순서와 표시가 둘 다 거짓말을 한다.
  const { error } = await admin.from("gthr_aply_rel").upsert(
    {
      gthr_id: gthrId,
      mem_id: memId,
      aply_st_cd: "pending",
      aply_memo_txt: memoCheck.value,
      rvw_by: null,
      rvw_at: null,
      rvw_memo_txt: null,
      crt_at: dayjs().toISOString(),
    },
    { onConflict: "gthr_id,mem_id" },
  );
  if (error) {
    console.error("[gthr-application] 신청 저장 실패", error.message);
    return fail("error");
  }

  return { ok: true, gathering: toRef(gathering) };
}

// ─────────────────────────────────────────────────────────────
// 승인 · 반려
// ─────────────────────────────────────────────────────────────

const RPC_FAIL: Partial<Record<string, ApplicationFailCode>> = {
  not_found: "not_found",
  no_application: "no_application",
  not_pending: "not_pending",
  not_active: "not_active",
  full: "full",
  already: "already_attending",
};

/**
 * 승인. 정원 재확인 → attd_rel INSERT → aply approved 는 RPC 안에서 한 트랜잭션으로 돈다
 * (모임 행을 FOR UPDATE 로 잠근다). 운영진이 목록에서 연달아 누르는 동작이라 레이스가 실재한다.
 */
export async function approveApplication(
  admin: SupabaseLike,
  {
    gthrId,
    memId,
    teamId,
    actorMemId,
    isAdmin,
  }: { gthrId: string; memId: string; teamId: string; actorMemId: string; isAdmin: boolean },
): Promise<ApplicationResult> {
  const gathering = await loadGathering(admin, gthrId, teamId);
  if (!gathering) return fail("not_found");
  if (!canReviewApplications(gathering, { memId: actorMemId, isAdmin })) return fail("forbidden");

  const { data, error } = await admin.rpc("approve_gthr_application", {
    p_gthr_id: gthrId,
    p_mem_id: memId,
    p_team_id: teamId,
    p_actor_mem_id: actorMemId,
  });
  if (error) {
    console.error("[gthr-application] 승인 실패", error.message);
    return fail("error");
  }
  if (data !== "ok") return fail(RPC_FAIL[data as string] ?? "error");

  return { ok: true, gathering: toRef(gathering) };
}

/**
 * 반려. `aply_st_cd = 'pending'` 조건을 UPDATE 의 WHERE 에 넣어, 이미 처리된 신청을
 * 덮어쓰지 않는다(조회 후 갱신 2단계로 나누면 그 사이에 승인된 건을 반려로 되돌린다).
 */
export async function rejectApplication(
  admin: SupabaseLike,
  {
    gthrId,
    memId,
    teamId,
    actorMemId,
    isAdmin,
    reason,
  }: {
    gthrId: string;
    memId: string;
    teamId: string;
    actorMemId: string;
    isAdmin: boolean;
    reason?: string | null;
  },
): Promise<ApplicationResult> {
  const gathering = await loadGathering(admin, gthrId, teamId);
  if (!gathering) return fail("not_found");
  if (!canReviewApplications(gathering, { memId: actorMemId, isAdmin })) return fail("forbidden");

  const reasonCheck = validateReviewMemo(reason);
  if (!reasonCheck.ok) return fail("invalid_input", reasonCheck.message);

  const { data, error } = await admin
    .from("gthr_aply_rel")
    .update({
      aply_st_cd: "rejected",
      rvw_by: actorMemId,
      rvw_at: dayjs().toISOString(),
      rvw_memo_txt: reasonCheck.value,
    })
    .eq("gthr_id", gthrId)
    .eq("mem_id", memId)
    .eq("aply_st_cd", "pending")
    .select("aply_id");

  if (error) {
    console.error("[gthr-application] 반려 실패", error.message);
    return fail("error");
  }
  if (!data || data.length === 0) return fail("not_pending");

  return { ok: true, gathering: toRef(gathering) };
}

// ─────────────────────────────────────────────────────────────
// 취소
// ─────────────────────────────────────────────────────────────

/**
 * 신청 취소(대기 중) 또는 참가 취소(확정 후).
 *
 * 확정 취소는 attd_rel DELETE + 취소 이력 INSERT + aply canceled 를 RPC 가 한 트랜잭션으로
 * 묶는다 — 나눠 부르면 중간에 죽었을 때 "참석은 빠졌는데 신청은 확정으로 남은" 행이 생긴다.
 *
 * @param actorCd self = 본인 취소, admin = 운영진 대리 취소
 */
export async function cancelApplication(
  admin: SupabaseLike,
  {
    gthrId,
    memId,
    teamId,
    actorCd,
    actorMemId,
    isAdmin,
    reason,
  }: {
    gthrId: string;
    memId: string;
    teamId: string;
    actorCd: "self" | "admin";
    actorMemId: string;
    isAdmin: boolean;
    reason?: string | null;
  },
): Promise<ApplicationResult> {
  const gathering = await loadGathering(admin, gthrId, teamId);
  if (!gathering) return fail("not_found");

  // 본인 취소는 본인만. 대리 취소는 심사 권한이 있는 사람만.
  if (actorCd === "self") {
    if (actorMemId !== memId) return fail("forbidden");
    if (isPastLockedFor(isAdmin, gathering.stt_at, gathering.end_at)) return fail("past_locked");
  } else if (!canReviewApplications(gathering, { memId: actorMemId, isAdmin })) {
    return fail("forbidden");
  }

  const reasonCheck = validateReviewMemo(reason);
  if (!reasonCheck.ok) return fail("invalid_input", reasonCheck.message);

  const { data, error } = await admin.rpc("cancel_gthr_application", {
    p_gthr_id: gthrId,
    p_mem_id: memId,
    p_team_id: teamId,
    p_actor_cd: actorCd,
    p_actor_mem_id: actorMemId,
    p_reason: reasonCheck.value,
  });
  if (error) {
    console.error("[gthr-application] 신청 취소 실패", error.message);
    return fail("error");
  }
  if (data !== "ok") return fail(RPC_FAIL[data as string] ?? "error");

  return { ok: true, gathering: toRef(gathering) };
}

// ─────────────────────────────────────────────────────────────
// 정합성 유지 — 다른 경로가 attd_rel 을 건드릴 때
// ─────────────────────────────────────────────────────────────

/**
 * 해당 모임의 기존 참석자를 `approved` 신청으로 채운다(멱등).
 *
 * 두 자리에서 쓴다:
 *   ① 이미 참석자가 있는 모임에 승인제를 켤 때 — 안 하면 확정자들이 상태 없는 유령이 된다
 *   ② 모임 개설 직후 개설자 자동 참석 뒤 — 안 하면 **모임을 만든 사람 자신이** 정원엔
 *      잡히는데 신청 관리 목록엔 안 보인다
 */
export async function backfillApprovals(
  admin: SupabaseLike,
  { gthrId, teamId, actorMemId }: { gthrId: string; teamId: string; actorMemId: string },
): Promise<number | null> {
  const { data, error } = await admin.rpc("backfill_gthr_approvals", {
    p_gthr_id: gthrId,
    p_team_id: teamId,
    p_actor_mem_id: actorMemId,
  });
  if (error) {
    // ⚠️ 0 으로 삼키면 안 된다 — 0 은 "맞출 게 없었다"는 정상 결과이기도 하다.
    //    실패를 성공으로 보고하면 승인제를 켜 놓고 기존 참석자 전원이 신청 관리에
    //    안 보이는 유령이 된 채로 "저장됐어요" 가 뜬다. null 로 갈라 호출부가 막게 한다.
    console.error("[gthr-application] 승인 백필 실패", error.message);
    return null;
  }
  return typeof data === "number" ? data : 0;
}

/** 아직 처리되지 않은 신청 수 — 승인제 해제 가능 여부 판정에 쓴다(설계 §9-g). */
export async function countPendingApplications(
  admin: SupabaseLike,
  gthrId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("gthr_aply_rel")
    .select("aply_id", { count: "exact", head: true })
    .eq("gthr_id", gthrId)
    .eq("aply_st_cd", "pending");
  if (error) {
    console.error("[gthr-application] 대기 건수 조회 실패", error.message);
    // 세지 못했으면 "0건"이라고 단정하지 않는다 — 해제를 막는 쪽이 안전하다.
    return -1;
  }
  return count ?? 0;
}
