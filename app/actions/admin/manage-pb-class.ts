"use server";

import { revalidatePath } from "next/cache";

import { withAdmin } from "@/lib/actions/auth";
import { dayjs, parseEventTime } from "@/lib/dayjs";
import {
  PB_CLASS_TYPE,
  feesForJoinWeek,
  weekNoOf,
  type PbClassCfg,
  type PbSessType,
} from "@/lib/pb-class";
import { cfgFromRow, loadPbClassBoard, type PbClassBoard } from "@/lib/queries/pb-class";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  pbCfgSchema,
  pbEvtIdSchema,
  pbGthrIdSchema,
  pbJoinWkNoSchema,
  pbMemIdSchema,
  pbParticipantUpdateSchema,
  pbPrtIdSchema,
  pbSessTypeSchema,
} from "@/lib/validations/pb-class";

/**
 * 겨울 10K PB 클래스 관리자 액션.
 *
 * ## 모든 쓰기가 service role 이다
 * `evt_pb_cfg`·`evt_pb_prt_rel`·`evt_gthr_rel`에는 쓰기 RLS 정책이 없다(SELECT 만 팀 멤버).
 * RLS 백스톱이 없는 셈이라 **여기서 매 액션마다 직접** 둘을 확인한다:
 * ① 관리자인가(`withAdmin`) ② 대상이 **요청 팀의 PB_CLASS 프로젝트**에 속하는가.
 * ②를 빼먹으면 관리자 한 명이 다른 팀(또는 마일리지런) 행을 id 추측만으로 건드린다.
 */

type R = { ok: boolean; message: string | null };

const NOT_FOUND = "프로젝트를 찾을 수 없습니다";
const GENERIC_FAIL = "처리에 실패했습니다";

/** zod 첫 오류를 사람 말 한 줄로 */
function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
}

type PbEvtGuard = { evt_id: string; stt_dt: string; end_dt: string };

/**
 * 요청 팀의 PB_CLASS 프로젝트만 돌려준다. 다른 팀·다른 종류·없는 id는 전부 null —
 * 존재 여부를 구분해 알려 주지 않는다.
 */
async function guardEvent(
  db: ReturnType<typeof createAdminClient>,
  evtId: string,
  teamId: string,
): Promise<PbEvtGuard | null> {
  const { data } = await db
    .from("evt_team_mst")
    .select("evt_id, stt_dt, end_dt")
    .eq("evt_id", evtId)
    .eq("team_id", teamId)
    .eq("evt_type_cd", PB_CLASS_TYPE)
    .maybeSingle();
  return data ?? null;
}

/** prt_id 로 지정되는 액션용 — 그 참가자가 요청 팀의 PB_CLASS 프로젝트 소속인지 한 번에 확인 */
async function guardParticipant(
  db: ReturnType<typeof createAdminClient>,
  prtId: string,
  teamId: string,
): Promise<{ prt_id: string; evt_id: string } | null> {
  const { data } = await db
    .from("evt_pb_prt_rel")
    .select("prt_id, evt_id, evt_team_mst!inner(team_id, evt_type_cd)")
    .eq("prt_id", prtId)
    .eq("evt_team_mst.team_id", teamId)
    .eq("evt_team_mst.evt_type_cd", PB_CLASS_TYPE)
    .maybeSingle();
  return data ? { prt_id: data.prt_id, evt_id: data.evt_id } : null;
}

// ─────────────────────────────────────────
// 조회
// ─────────────────────────────────────────

export async function getPbClassAdminBoard(
  evtId: string,
): Promise<{ ok: true; message: null; board: PbClassBoard } | { ok: false; message: string }> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();
    try {
      // 팀을 넘겨 다른 팀 프로젝트가 열리지 않게 한다(조회도 service role 이라 RLS 가 없다)
      const board = await loadPbClassBoard(db, parsedEvt.data, dayjs().toISOString(), { teamId });
      if (!board) return { ok: false as const, message: NOT_FOUND };
      return { ok: true as const, message: null, board };
    } catch (e) {
      console.error("[getPbClassAdminBoard]", e);
      return { ok: false as const, message: "PB 클래스 정보를 불러오지 못했습니다" };
    }
  });
}

export async function listPbLinkCandidates(evtId: string): Promise<
  | {
      ok: true;
      message: null;
      items: {
        gthrId: string;
        gthrNm: string;
        sttAt: string;
        gthrTypeEnm: string;
        attdCnt: number;
        wkNo: number;
      }[];
    }
  | { ok: false; message: string }
> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false as const, message: NOT_FOUND };

    // 프로젝트 기간 = 시작일 00:00 KST ~ 종료일 24:00 KST(다음날 00:00 미만).
    // 날짜 문자열은 parseEventTime 으로 KST 자정에 고정한다 — dayjs("YYYY-MM-DD")는 서버(UTC)에선 UTC 자정이다.
    const startIso = parseEventTime(evt.stt_dt).toISOString();
    const endExclIso = parseEventTime(evt.end_dt).add(1, "day").toISOString();

    try {
      const [gthrs, linked] = await Promise.all([
        fetchAllRows(
          () =>
            db
              .from("gthr_mst")
              .select("gthr_id, gthr_nm, stt_at, gthr_type_enm, gthr_attd_rel(count)")
              .eq("team_id", teamId)
              .eq("del_yn", false)
              .gte("stt_at", startIso)
              .lt("stt_at", endExclIso)
              // stt_at 은 겹칠 수 있어 PK 를 두 번째 정렬로 덧붙인다(페이지 경계 보호)
              .order("stt_at", { ascending: true })
              .order("gthr_id", { ascending: true }),
          { label: "pb-class:link-candidates:gthr_mst" },
        ),
        // 벙 하나는 어느 프로젝트에든 한 번만 연결된다(PK) — 다른 프로젝트에 걸린 벙도 후보에서 뺀다
        fetchAllRows(
          () => db.from("evt_gthr_rel").select("gthr_id").order("gthr_id", { ascending: true }),
          { label: "pb-class:link-candidates:evt_gthr_rel" },
        ),
      ]);
      const taken = new Set(linked.map((l) => l.gthr_id));

      const items = gthrs
        .filter((g) => !taken.has(g.gthr_id))
        .map((g) => ({
          gthrId: g.gthr_id,
          gthrNm: g.gthr_nm,
          sttAt: g.stt_at,
          gthrTypeEnm: g.gthr_type_enm,
          attdCnt: (g.gthr_attd_rel as { count: number }[] | null)?.[0]?.count ?? 0,
          wkNo: weekNoOf(g.stt_at, evt.stt_dt),
        }));
      return { ok: true as const, message: null, items };
    } catch (e) {
      console.error("[listPbLinkCandidates]", e);
      return { ok: false as const, message: "벙 목록을 불러오지 못했습니다" };
    }
  });
}

// ─────────────────────────────────────────
// 설정
// ─────────────────────────────────────────

export async function savePbCfg(evtId: string, cfg: PbClassCfg): Promise<R> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };
  const parsedCfg = pbCfgSchema.safeParse(cfg);
  if (!parsedCfg.success) return { ok: false, message: firstIssue(parsedCfg.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND };

    // 이미 낸 금액은 참가자 행(deposit_amt)에 박혀 있어 설정을 바꿔도 소급되지 않는다.
    // 설정이 바꾸는 건 앞으로의 신청 금액과 환급 기준(출석 요건)이다.
    const c = parsedCfg.data;
    const { error } = await db.from("evt_pb_cfg").upsert(
      {
        evt_id: parsedEvt.data,
        tot_sess_cnt: c.totSessCnt,
        full_rfnd_attd_cnt: c.fullRfndAttdCnt,
        late_join_wk_no: c.lateJoinWkNo,
        deposit_amt: c.depositAmt,
        entry_fee_amt: c.entryFeeAmt,
        updated_at: dayjs().toISOString(),
      },
      { onConflict: "evt_id" },
    );
    if (error) return { ok: false, message: "설정 저장에 실패했습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 벙 연결
// ─────────────────────────────────────────

export async function linkPbSession(evtId: string, gthrId: string, sessType: PbSessType): Promise<R> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };
  const parsedGthr = pbGthrIdSchema.safeParse(gthrId);
  if (!parsedGthr.success) return { ok: false, message: firstIssue(parsedGthr.error) };
  const parsedType = pbSessTypeSchema.safeParse(sessType);
  if (!parsedType.success) return { ok: false, message: firstIssue(parsedType.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND };

    const { data: gthr } = await db
      .from("gthr_mst")
      .select("gthr_id, team_id, del_yn, stt_at")
      .eq("gthr_id", parsedGthr.data)
      .maybeSingle();
    if (!gthr || gthr.team_id !== teamId || gthr.del_yn) {
      return { ok: false, message: "벙을 찾을 수 없습니다" };
    }

    // 주차는 클라이언트가 보내지 않는다 — 벙 시작 시각에서 서버가 계산해 저장한다.
    const wkNo = weekNoOf(gthr.stt_at, evt.stt_dt);
    if (wkNo < 1) return { ok: false, message: "프로젝트 시작 전의 벙은 연결할 수 없어요" };

    const { error } = await db.from("evt_gthr_rel").insert({
      gthr_id: parsedGthr.data,
      evt_id: parsedEvt.data,
      wk_no: wkNo,
      sess_type_cd: parsedType.data,
    });
    if (error) {
      if (error.code === "23505") {
        // 어느 제약에 걸렸는지는 메시지에 제약 이름이 실려 온다 — 사용자에게 줄 말이 제약마다 다르다
        if (error.message.includes("uq_evt_gthr_rel_evt_wk")) {
          return { ok: false, message: `${wkNo}주차엔 이미 연결된 벙이 있어요` };
        }
        if (error.message.includes("uq_evt_gthr_rel_measure")) {
          return { ok: false, message: "측정 일정은 하나만 지정할 수 있어요" };
        }
        return { ok: false, message: "이미 프로젝트에 연결된 벙이에요" };
      }
      return { ok: false, message: "벙 연결에 실패했습니다" };
    }

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

export async function unlinkPbSession(evtId: string, gthrId: string): Promise<R> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };
  const parsedGthr = pbGthrIdSchema.safeParse(gthrId);
  if (!parsedGthr.success) return { ok: false, message: firstIssue(parsedGthr.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND };

    // evt_id 까지 걸어 다른 프로젝트의 연결을 풀 수 없게 한다
    const { data, error } = await db
      .from("evt_gthr_rel")
      .delete()
      .eq("gthr_id", parsedGthr.data)
      .eq("evt_id", parsedEvt.data)
      .select("gthr_id");
    if (error) return { ok: false, message: "연결 해제에 실패했습니다" };
    if (!data || data.length === 0) return { ok: false, message: "연결된 벙을 찾을 수 없습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 참가자
// ─────────────────────────────────────────

export async function approvePbParticipant(prtId: string): Promise<R> {
  const parsed = pbPrtIdSchema.safeParse(prtId);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    if (!(await guardParticipant(db, parsed.data, teamId))) return { ok: false, message: "참가자를 찾을 수 없습니다" };

    const now = dayjs().toISOString();
    const { error } = await db
      .from("evt_pb_prt_rel")
      .update({ aprv_yn: true, aprv_at: now, updated_at: now })
      .eq("prt_id", parsed.data);
    if (error) return { ok: false, message: "승인 처리에 실패했습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

export async function revokePbApproval(prtId: string): Promise<R> {
  const parsed = pbPrtIdSchema.safeParse(prtId);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    if (!(await guardParticipant(db, parsed.data, teamId))) return { ok: false, message: "참가자를 찾을 수 없습니다" };

    const { error } = await db
      .from("evt_pb_prt_rel")
      .update({ aprv_yn: false, aprv_at: null, updated_at: dayjs().toISOString() })
      .eq("prt_id", parsed.data);
    if (error) return { ok: false, message: "승인 취소에 실패했습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

export async function deletePbParticipant(prtId: string): Promise<R> {
  const parsed = pbPrtIdSchema.safeParse(prtId);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    if (!(await guardParticipant(db, parsed.data, teamId))) return { ok: false, message: "참가자를 찾을 수 없습니다" };

    const { error } = await db.from("evt_pb_prt_rel").delete().eq("prt_id", parsed.data);
    if (error) return { ok: false, message: "삭제에 실패했습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

export async function updatePbParticipant(
  prtId: string,
  input: { joinWkNo: number; depositAmt: number; entryFeeAmt: number },
): Promise<R> {
  const parsedPrt = pbPrtIdSchema.safeParse(prtId);
  if (!parsedPrt.success) return { ok: false, message: firstIssue(parsedPrt.error) };
  const parsedInput = pbParticipantUpdateSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, message: firstIssue(parsedInput.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    if (!(await guardParticipant(db, parsedPrt.data, teamId))) return { ok: false, message: "참가자를 찾을 수 없습니다" };

    // 환급 계산은 이 행의 deposit_amt 를 쓴다 — 관리자가 실제 낸 금액으로 고칠 수 있어야 한다
    const { error } = await db
      .from("evt_pb_prt_rel")
      .update({
        join_wk_no: parsedInput.data.joinWkNo,
        deposit_amt: parsedInput.data.depositAmt,
        entry_fee_amt: parsedInput.data.entryFeeAmt,
        updated_at: dayjs().toISOString(),
      })
      .eq("prt_id", parsedPrt.data);
    if (error) return { ok: false, message: "수정에 실패했습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

/**
 * 관리자가 참가자를 직접 추가한다 — 카톡·계좌로 먼저 받은 사람(앱 신청이 늦은 1단계의 지연 대비책).
 * 이미 입금을 확인한 사람이라 승인 상태로 들어간다.
 */
export async function addPbParticipant(evtId: string, memId: string, joinWkNo: number): Promise<R> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };
  const parsedMem = pbMemIdSchema.safeParse(memId);
  if (!parsedMem.success) return { ok: false, message: firstIssue(parsedMem.error) };
  const parsedWk = pbJoinWkNoSchema.safeParse(joinWkNo);
  if (!parsedWk.success) return { ok: false, message: firstIssue(parsedWk.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND };

    // 활동 중인 팀 멤버만 — 탈퇴·비활성·다른 팀 멤버에게 보증금 행을 만들지 않는다
    const { data: memRel } = await db
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("mem_id", parsedMem.data)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_st_cd", "active")
      .maybeSingle();
    if (!memRel) return { ok: false, message: "추가할 수 없는 멤버입니다" };

    const { data: cfgRow, error: cfgError } = await db
      .from("evt_pb_cfg")
      .select("*")
      .eq("evt_id", parsedEvt.data)
      .maybeSingle();
    if (cfgError) return { ok: false, message: GENERIC_FAIL };
    const fees = feesForJoinWeek(parsedWk.data, cfgFromRow(cfgRow));

    const now = dayjs().toISOString();
    const { error } = await db.from("evt_pb_prt_rel").insert({
      evt_id: parsedEvt.data,
      mem_id: parsedMem.data,
      join_wk_no: parsedWk.data,
      deposit_amt: fees.depositAmt,
      entry_fee_amt: fees.entryFeeAmt,
      aprv_yn: true,
      aprv_at: now,
    });
    if (error) {
      if (error.code === "23505") return { ok: false, message: "이미 참가 중인 멤버예요" };
      return { ok: false, message: "참가자 추가에 실패했습니다" };
    }

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}
