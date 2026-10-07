"use server";

import { revalidatePath } from "next/cache";

import { withAdmin } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { guardEvent, guardGroup, guardParticipant } from "@/lib/pb-class-guard";
import { ruleFromJson, type PbRecType, type PbRule } from "@/lib/pb-class-score";
import { loadPbGame, type PbGame } from "@/lib/queries/pb-class-game";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectInChunks } from "@/lib/titles/query-chunk";
import {
  checkGoalCap,
  pbAssignRowsSchema,
  pbEvtIdSchema,
  pbGoalSecSchema,
  pbGrpIdSchema,
  pbGroupInputSchema,
  pbGroupUpdateSchema,
  pbPrtIdSchema,
  pbRecordRowsSchema,
  pbRuleSchema,
} from "@/lib/validations/pb-class";

/**
 * 겨울 10K PB 클래스 2·3단계 관리자 액션 — 게임팀·목표·기록.
 *
 * 팀 미션 액션(생성·수정·삭제·기본값·결과)과 기록 확인(`confirmPbRecord`)은 오너 지시로 없앴다(2026-10-07).
 * 점수에 관리자가 손으로 넣는 값이 남아 있으면 「누가 왜 이 점수를 줬나」를 따져야 하고, 회원이 자기 기록을
 * 직접 적게 하면서 확인 단계도 필요 없어졌다. 관리자 기록 입력(`upsertPbRecords`)은 정정용으로 남는다.
 *
 * ## 모든 쓰기가 service role 이다 (`manage-pb-class.ts`와 같다)
 * 새 테이블 둘(`evt_pb_grp_mst`·`evt_pb_rec_hist`)에도 쓰기 RLS 정책이 없다. RLS 백스톱이 없으니 매 액션마다
 * ① 관리자인가(`withAdmin`) ② 대상이 **요청 팀의 PB_CLASS 프로젝트**에 속하는가(`lib/pb-class-guard.ts`)를
 * 직접 확인한다. id 를 받는 액션은 그 id 가 가리키는 행의 프로젝트로 판정하고, 한 액션에 id 가 둘 이상 섞이면
 * (편성) **같은 프로젝트 소속인지**까지 교차 확인한다 — 안 그러면 내 프로젝트의 참가자에 남의 프로젝트 팀을
 * 걸 수 있다.
 */

type R = { ok: boolean; message: string | null };

const NOT_FOUND = "프로젝트를 찾을 수 없습니다";
const GENERIC_FAIL = "처리에 실패했습니다";

/** `.in()` 에 실을 id 수 — URL 길이 안전 한도(uuid 36자 × 100 ≈ 3.6KB) */
const IN_CHUNK = 100;

/** zod 첫 오류를 사람 말 한 줄로 */
function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
}

function chunked<T>(items: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 그 프로젝트의 현재 규칙 — 설정 행이 없거나 일부만 저장돼 있어도 기본값으로 채워진다 */
async function loadRule(db: ReturnType<typeof createAdminClient>, evtId: string): Promise<PbRule> {
  const { data } = await db.from("evt_pb_cfg").select("rule_json").eq("evt_id", evtId).maybeSingle();
  return ruleFromJson(data?.rule_json);
}

/** 다음 게임팀 sort_ord — 새 팀은 맨 뒤에 선다 */
async function nextGroupSortOrd(db: ReturnType<typeof createAdminClient>, evtId: string): Promise<number> {
  const { data } = await db
    .from("evt_pb_grp_mst")
    .select("sort_ord")
    .eq("evt_id", evtId)
    .order("sort_ord", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_ord ?? -1) + 1;
}

// ─────────────────────────────────────────
// 조회
// ─────────────────────────────────────────

export async function getPbGameAdmin(
  evtId: string,
): Promise<{ ok: true; message: null; game: PbGame } | { ok: false; message: string }> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    try {
      // 팀을 넘겨 다른 팀 프로젝트가 열리지 않게 한다(조회도 service role 이라 RLS 가 없다)
      const game = await loadPbGame(db, parsedEvt.data, dayjs().toISOString(), { teamId });
      if (!game) return { ok: false as const, message: NOT_FOUND };
      return { ok: true as const, message: null, game };
    } catch (e) {
      console.error("[getPbGameAdmin]", e);
      return { ok: false as const, message: "PB 클래스 정보를 불러오지 못했습니다" };
    }
  });
}

// ─────────────────────────────────────────
// 규칙
// ─────────────────────────────────────────

export async function savePbRule(evtId: string, rule: PbRule): Promise<R> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };
  const parsedRule = pbRuleSchema.safeParse(rule);
  if (!parsedRule.success) return { ok: false, message: firstIssue(parsedRule.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND };

    // 설정 행이 아직 없으면 규칙만 담아 새로 만든다 — 나머지 컬럼은 DB 기본값(기본 환급 규칙)이다.
    // 충돌 시엔 보낸 컬럼만 덮어쓰므로 보증금·환급 설정(`savePbCfg`)은 건드리지 않는다.
    const { error } = await db.from("evt_pb_cfg").upsert(
      { evt_id: parsedEvt.data, rule_json: parsedRule.data, updated_at: dayjs().toISOString() },
      { onConflict: "evt_id" },
    );
    if (error) return { ok: false, message: "규칙 저장에 실패했습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 게임팀
// ─────────────────────────────────────────

export async function createPbGroup(
  evtId: string,
  input: { grpNm: string; colorNo: number | null },
): Promise<R> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };
  const parsedInput = pbGroupInputSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, message: firstIssue(parsedInput.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND };

    const { error } = await db.from("evt_pb_grp_mst").insert({
      evt_id: parsedEvt.data,
      grp_nm: parsedInput.data.grpNm,
      color_no: parsedInput.data.colorNo,
      sort_ord: await nextGroupSortOrd(db, parsedEvt.data),
    });
    if (error) {
      if (error.code === "23505") return { ok: false, message: "같은 이름의 팀이 이미 있어요" };
      return { ok: false, message: "팀 추가에 실패했습니다" };
    }

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

export async function updatePbGroup(
  grpId: string,
  input: { grpNm: string; colorNo: number | null; sortOrd: number },
): Promise<R> {
  const parsedGrp = pbGrpIdSchema.safeParse(grpId);
  if (!parsedGrp.success) return { ok: false, message: firstIssue(parsedGrp.error) };
  const parsedInput = pbGroupUpdateSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, message: firstIssue(parsedInput.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    if (!(await guardGroup(db, parsedGrp.data, teamId))) return { ok: false, message: "팀을 찾을 수 없습니다" };

    const { error } = await db
      .from("evt_pb_grp_mst")
      .update({
        grp_nm: parsedInput.data.grpNm,
        color_no: parsedInput.data.colorNo,
        sort_ord: parsedInput.data.sortOrd,
        updated_at: dayjs().toISOString(),
      })
      .eq("grp_id", parsedGrp.data);
    if (error) {
      if (error.code === "23505") return { ok: false, message: "같은 이름의 팀이 이미 있어요" };
      return { ok: false, message: "팀 수정에 실패했습니다" };
    }

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

export async function deletePbGroup(grpId: string): Promise<R> {
  const parsed = pbGrpIdSchema.safeParse(grpId);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    if (!(await guardGroup(db, parsed.data, teamId))) return { ok: false, message: "팀을 찾을 수 없습니다" };

    // FK 가 알아서 처리한다: 소속 참가자는 미배정(SET NULL)으로 돌아간다
    const { error } = await db.from("evt_pb_grp_mst").delete().eq("grp_id", parsed.data);
    if (error) return { ok: false, message: "팀 삭제에 실패했습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 편성(훈련팀·게임팀)
// ─────────────────────────────────────────

export async function assignPbParticipants(
  evtId: string,
  rows: { prtId: string; trnGrpCd: string | null; grpId: string | null }[],
): Promise<R> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };
  const parsedRows = pbAssignRowsSchema.safeParse(rows);
  if (!parsedRows.success) return { ok: false, message: firstIssue(parsedRows.error) };
  if (parsedRows.data.length === 0) return { ok: true, message: null };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND };

    try {
      // 참가자·팀이 전부 **이 프로젝트** 소속인지 확인한다 — 한 건이라도 밖이면 아무것도 쓰지 않는다
      const prtIds = parsedRows.data.map((r) => r.prtId);
      const found = await selectInChunks<{ prt_id: string }>(prtIds, (chunk) =>
        db
          .from("evt_pb_prt_rel")
          .select("prt_id")
          .eq("evt_id", parsedEvt.data)
          .in("prt_id", chunk)
          .order("prt_id", { ascending: true }),
      );
      if (found.length !== prtIds.length) return { ok: false, message: "참가자를 찾을 수 없습니다" };

      const grpIds = [...new Set(parsedRows.data.flatMap((r) => (r.grpId ? [r.grpId] : [])))];
      if (grpIds.length > 0) {
        const { data: grps, error } = await db
          .from("evt_pb_grp_mst")
          .select("grp_id")
          .eq("evt_id", parsedEvt.data)
          .in("grp_id", grpIds);
        if (error) return { ok: false, message: GENERIC_FAIL };
        if ((grps ?? []).length !== grpIds.length) return { ok: false, message: "팀을 찾을 수 없습니다" };
      }

      // 행마다 값이 달라 한 번에 upsert 할 수 없다(NOT NULL 컬럼이 insert 단계에서 막힌다). 같은 값끼리 묶어
      // 묶음당 한 번 쓴다 — 훈련팀 5 × 게임팀 N 이라 호출 수가 참가자 수가 아니라 조합 수로 줄어든다.
      const buckets = new Map<string, { trnGrpCd: string | null; grpId: string | null; prtIds: string[] }>();
      for (const r of parsedRows.data) {
        const key = `${r.trnGrpCd ?? ""}|${r.grpId ?? ""}`;
        const b = buckets.get(key) ?? { trnGrpCd: r.trnGrpCd, grpId: r.grpId, prtIds: [] };
        b.prtIds.push(r.prtId);
        buckets.set(key, b);
      }

      const now = dayjs().toISOString();
      for (const b of buckets.values()) {
        for (const ids of chunked(b.prtIds)) {
          const { error } = await db
            .from("evt_pb_prt_rel")
            .update({ trn_grp_cd: b.trnGrpCd, grp_id: b.grpId, updated_at: now })
            .eq("evt_id", parsedEvt.data)
            .in("prt_id", ids);
          if (error) return { ok: false, message: "편성 저장에 실패했습니다" };
        }
      }
    } catch (e) {
      console.error("[assignPbParticipants]", e);
      return { ok: false, message: "편성 저장에 실패했습니다" };
    }

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 목표·기록
// ─────────────────────────────────────────

/**
 * 관리자가 참가자 목표를 대신 넣는다. **W2 수정 마감(`goalEditUntilWk`)은 우회하지만 상한(`goalMaxSec`)은
 * 못 넘는다** — 마감은 회원이 늦게 바꿔 점수를 끼워 맞추는 걸 막는 장치라 운영진은 필요 없고(늦은 합류자·
 * 정정 요청), 상한은 「60분 이내」라는 규칙 자체라 운영진도 예외가 아니다.
 */
export async function setPbGoalByAdmin(prtId: string, goalSec: number | null): Promise<R> {
  const parsedPrt = pbPrtIdSchema.safeParse(prtId);
  if (!parsedPrt.success) return { ok: false, message: firstIssue(parsedPrt.error) };
  const parsedGoal = pbGoalSecSchema.nullable().safeParse(goalSec);
  if (!parsedGoal.success) return { ok: false, message: firstIssue(parsedGoal.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const prt = await guardParticipant(db, parsedPrt.data, teamId);
    if (!prt) return { ok: false, message: "참가자를 찾을 수 없습니다" };

    if (parsedGoal.data !== null) {
      const capMsg = checkGoalCap(parsedGoal.data, await loadRule(db, prt.evt_id));
      if (capMsg) return { ok: false, message: capMsg };
    }

    const { error } = await db
      .from("evt_pb_prt_rel")
      .update({ goal_sec: parsedGoal.data, updated_at: dayjs().toISOString() })
      .eq("prt_id", parsedPrt.data);
    if (error) return { ok: false, message: "목표 저장에 실패했습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

/**
 * 측정 기록 일괄 입력(정정용) — `recSec: null` 은 삭제. 기록은 회원이 직접 적는 게 원칙이고(`setMyPbRecord`),
 * 이 액션은 잘못 적은 기록·대리 입력을 고치는 길이다. 확인 단계가 없어져 모든 기록이 `cnfm_yn=true` 로 저장된다.
 * 같은 (참가자, 종류)가 이미 있으면 덮어쓴다(종류당 1건 — UNIQUE).
 */
export async function upsertPbRecords(
  evtId: string,
  rows: { prtId: string; recTypeCd: PbRecType; recSec: number | null }[],
): Promise<R> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };
  const parsedRows = pbRecordRowsSchema.safeParse(rows);
  if (!parsedRows.success) return { ok: false, message: firstIssue(parsedRows.error) };
  if (parsedRows.data.length === 0) return { ok: true, message: null };

  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND };

    try {
      const prtIds = [...new Set(parsedRows.data.map((r) => r.prtId))];
      const found = await selectInChunks<{ prt_id: string }>(prtIds, (chunk) =>
        db
          .from("evt_pb_prt_rel")
          .select("prt_id")
          .eq("evt_id", parsedEvt.data)
          .in("prt_id", chunk)
          .order("prt_id", { ascending: true }),
      );
      if (found.length !== prtIds.length) return { ok: false, message: "참가자를 찾을 수 없습니다" };

      const now = dayjs().toISOString();
      const upserts = parsedRows.data.flatMap((r) =>
        r.recSec === null
          ? []
          : [
              {
                prt_id: r.prtId,
                rec_type_cd: r.recTypeCd,
                rec_sec: r.recSec,
                cnfm_yn: true,
                crt_by: member.id,
                updated_at: now,
              },
            ],
      );
      if (upserts.length > 0) {
        const { error } = await db.from("evt_pb_rec_hist").upsert(upserts, { onConflict: "prt_id,rec_type_cd" });
        if (error) return { ok: false, message: "기록 저장에 실패했습니다" };
      }

      // 삭제는 종류별로 묶는다 — (prt, type) 쌍을 한 쿼리로 못 말해서 종류 하나당 `prt_id IN (...)` 한 번
      const delByType = new Map<PbRecType, string[]>();
      for (const r of parsedRows.data) {
        if (r.recSec !== null) continue;
        const list = delByType.get(r.recTypeCd) ?? [];
        list.push(r.prtId);
        delByType.set(r.recTypeCd, list);
      }
      for (const [type, ids] of delByType) {
        for (const chunk of chunked(ids)) {
          const { error } = await db.from("evt_pb_rec_hist").delete().eq("rec_type_cd", type).in("prt_id", chunk);
          if (error) return { ok: false, message: "기록 삭제에 실패했습니다" };
        }
      }
    } catch (e) {
      console.error("[upsertPbRecords]", e);
      return { ok: false, message: "기록 저장에 실패했습니다" };
    }

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}
