"use server";

import { revalidatePath, updateTag } from "next/cache";

import { withAdmin } from "@/lib/actions/auth";
import { dayjs, formatKST, parseEventTime } from "@/lib/dayjs";
import {
  feesForJoinWeek,
  pbEndDtFor,
  weekNoOf,
  type PbClassCfg,
  type PbSessType,
} from "@/lib/pb-class";
import { guardEvent, guardParticipant } from "@/lib/pb-class-guard";
import { PB_DEFAULT_SESS_PLANS, type PbSessPlan } from "@/lib/pb-class-plan";
import { HOME_CALENDAR_CACHE_TAG } from "@/lib/home-calendar-cache-tag";
import { buildSessDrafts, draftEndIso, draftStartIso, type PbSessDraft } from "@/lib/pb-class-sessions";
import {
  cfgFromRow,
  isMileageAlumni,
  loadPbClassBoard,
  loadSessPlanRows,
  toSessPlans,
  type PbClassBoard,
} from "@/lib/queries/pb-class";
import { ensureDefaultSessPlans } from "@/lib/pb-class-seed";
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
  pbSessDraftsSchema,
  pbSessNoSchema,
  pbSessPlanSchema,
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
        mlg_dc_amt: c.mlgDcAmt,
        updated_at: dayjs().toISOString(),
      },
      { onConflict: "evt_id" },
    );
    if (error) return { ok: false, message: "설정 저장에 실패했습니다" };

    // 종료일은 시작일 + (총 회차 + 1)주 − 1일이라 총 회차가 바뀌면 같이 움직인다. 설정 저장과 한 몸으로
    // 다시 계산해 둬야, 회차 수만 고치고 종료일을 못 고쳐 측정 벙 연결이 막히는 어긋남이 안 생긴다.
    const { error: endError } = await db
      .from("evt_team_mst")
      .update({ end_dt: pbEndDtFor(evt.stt_dt, c), updated_at: dayjs().toISOString() })
      .eq("evt_id", parsedEvt.data)
      .eq("team_id", teamId);
    if (endError) return { ok: false, message: "설정은 저장됐지만 종료일 갱신에 실패했습니다. 다시 저장해 주세요" };

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
    // 후보 목록은 기간으로 거르지만 액션은 gthr_id 만 받으므로 여기서 다시 막는다
    if (formatKST(gthr.stt_at, "YYYY-MM-DD") > evt.end_dt) {
      return { ok: false, message: "프로젝트 종료일 이후의 벙은 연결할 수 없어요" };
    }

    // 공식훈련은 W1~W(총회차-1) 칸에만 선다(회차 띠·남은 회차 산술이 그 전제다). 그 밖의 주차에
    // 훈련을 걸면 출석은 세지는데 회원 띠에는 칸이 없어, 체크 수와 출석 수가 어긋난다.
    if (parsedType.data === "TRAINING") {
      const { data: cfgRow } = await db
        .from("evt_pb_cfg")
        .select("*")
        .eq("evt_id", parsedEvt.data)
        .maybeSingle();
      const lastTrainingWk = cfgFromRow(cfgRow ?? null).totSessCnt - 1;
      if (wkNo > lastTrainingWk) {
        return {
          ok: false,
          message: `공식훈련은 W1~W${lastTrainingWk}에만 연결할 수 있어요 (이 벙은 W${wkNo}). 측정 일정이면 종류를 측정으로 골라 주세요`,
        };
      }
    }

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
  input: { joinWkNo: number; depositAmt: number; entryFeeAmt: number; depositDcAmt?: number },
): Promise<R> {
  const parsedPrt = pbPrtIdSchema.safeParse(prtId);
  if (!parsedPrt.success) return { ok: false, message: firstIssue(parsedPrt.error) };
  const parsedInput = pbParticipantUpdateSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, message: firstIssue(parsedInput.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    if (!(await guardParticipant(db, parsedPrt.data, teamId))) return { ok: false, message: "참가자를 찾을 수 없습니다" };

    // 환급 계산은 이 행의 deposit_amt 를 쓴다 — 관리자가 실제 낸 금액으로 고칠 수 있어야 한다.
    // deposit_dc_amt 는 표시용이라 환급엔 영향이 없지만, 보증금이 0(늦은 합류로 바꾼 경우 등)이면
    // 「할인 받았다」는 기록이 남을 이유가 없어 0 으로 맞춘다 — 화면에 "보증금 0원, 할인 5,000원"이 뜨지 않게.
    const dcAmt = parsedInput.data.depositAmt === 0 ? 0 : parsedInput.data.depositDcAmt;
    const { error } = await db
      .from("evt_pb_prt_rel")
      .update({
        join_wk_no: parsedInput.data.joinWkNo,
        deposit_amt: parsedInput.data.depositAmt,
        entry_fee_amt: parsedInput.data.entryFeeAmt,
        ...(dcAmt === undefined ? {} : { deposit_dc_amt: dcAmt }),
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

    // 회원이 직접 신청할 때와 같은 할인을 적용한다 — 관리자 추가는 "카톡으로 먼저 받은 사람"이라 같은 사람이
    // 어느 문으로 들어왔느냐에 따라 보증금이 달라지면 안 된다. 관리자가 실제 낸 금액이 다르면 수정으로 고친다.
    // 조회가 실패하면 할인 대상자에게 말없이 더 받게 되므로 행을 만들지 않고 실패로 돌려보낸다.
    let mlgAlumni: boolean;
    try {
      mlgAlumni = await isMileageAlumni(db, teamId, parsedMem.data);
    } catch (e) {
      console.error("[addPbParticipant] 마일리지런 이력 조회 실패", e);
      return { ok: false, message: GENERIC_FAIL };
    }
    const fees = feesForJoinWeek(parsedWk.data, cfgFromRow(cfgRow), { mlgAlumni });

    const now = dayjs().toISOString();
    const { error } = await db.from("evt_pb_prt_rel").insert({
      evt_id: parsedEvt.data,
      mem_id: parsedMem.data,
      join_wk_no: parsedWk.data,
      deposit_amt: fees.depositAmt,
      deposit_dc_amt: fees.depositDcAmt,
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

// ─────────────────────────────────────────
// 회차별 훈련표
// ─────────────────────────────────────────
//
// `evt_pb_sess_plan`에도 쓰기 RLS 정책이 없다(SELECT 만 팀 멤버) — 위 액션들과 같이 service role 이고,
// 매 액션이 `guardEvent`로 「요청 팀의 PB_CLASS 프로젝트인가」를 직접 확인한다.

/**
 * 기본 훈련표(`PB_DEFAULT_SESS_PLANS`)를 이 프로젝트에 넣는다 — **훈련표가 하나도 없을 때만**.
 *
 * 이미 손본 훈련표 위에 기본값을 덮어 쓰면 관리자의 수정이 말없이 사라지므로, 한 줄이라도 있으면 거절한다.
 * 먼저 세어 보는 것과 별개로 PK(evt_id, sess_no) 충돌(23505)도 같은 문구로 받는다 — 두 관리자가 동시에
 * 누르면 둘 다 "없음"을 보고 들어올 수 있는데, 그때도 앞사람 것을 덮지 않고 한쪽이 거절된다.
 *
 * 기본값은 총 회차 13(공식훈련 12 + 측정 1) 기준 내용이라, 총 회차가 다르면 몇 번째가 측정인지·몇 주차에
 * 무슨 훈련인지가 어긋난 채 들어간다. 반쯤 맞는 표를 넣는 것보다 거절하고 직접 쓰게 한다.
 */
export async function seedPbSessPlans(evtId: string): Promise<R> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND };

    // 진행중 전환 때 자동으로 채우는 것과 같은 함수 — 규칙(13회차일 때만, 비어 있을 때만)이 한 곳에 있다
    let result: Awaited<ReturnType<typeof ensureDefaultSessPlans>>;
    try {
      result = await ensureDefaultSessPlans(db, parsedEvt.data);
    } catch {
      return { ok: false, message: "기본 훈련표를 불러오지 못했습니다" };
    }
    if (result === "exists") return { ok: false, message: "이미 훈련표가 있어요. 회차마다 직접 고쳐 주세요" };
    if (result === "cfg_mismatch") {
      return {
        ok: false,
        message: `기본 훈련표는 총 ${PB_DEFAULT_SESS_PLANS.length}회차용이에요. 총 회차가 달라서 회차마다 직접 입력해 주세요`,
      };
    }
    if (result === "not_pb") return { ok: false, message: NOT_FOUND };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

/**
 * 회차 훈련 한 칸을 저장한다(있으면 고치고 없으면 추가). 회차 번호는 총 회차(`tot_sess_cnt`) 이하만 —
 * 그 밖의 번호는 회원 화면 회차 띠에 칸이 없어 입력해도 어디에도 안 보인다.
 */
export async function upsertPbSessPlan(evtId: string, plan: PbSessPlan): Promise<R> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };
  const parsedPlan = pbSessPlanSchema.safeParse(plan);
  if (!parsedPlan.success) return { ok: false, message: firstIssue(parsedPlan.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND };

    const { data: cfgRow, error: cfgError } = await db
      .from("evt_pb_cfg")
      .select("*")
      .eq("evt_id", parsedEvt.data)
      .maybeSingle();
    if (cfgError) return { ok: false, message: GENERIC_FAIL };
    const totSessCnt = cfgFromRow(cfgRow).totSessCnt;
    const p = parsedPlan.data;
    if (p.sessNo > totSessCnt) {
      return { ok: false, message: `회차 번호는 총 회차(${totSessCnt}회차) 이하여야 해요` };
    }

    // created_at 은 보내지 않는다 — 고칠 때 최초 작성 시각이 덮이지 않고, 새로 만들 땐 DB 기본값이 채운다
    const { error } = await db.from("evt_pb_sess_plan").upsert(
      {
        evt_id: parsedEvt.data,
        sess_no: p.sessNo,
        trn_kind_cd: p.kindCd,
        ttl: p.ttl,
        main_txt: p.mainTxt,
        easy_txt: p.easyTxt,
        self_trn_txt: p.selfTxt,
        note_txt: p.noteTxt,
        updated_at: dayjs().toISOString(),
      },
      { onConflict: "evt_id,sess_no" },
    );
    if (error) return { ok: false, message: "훈련표 저장에 실패했습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

/** 회차 훈련 한 칸을 지운다. evt_id 까지 걸어 다른 프로젝트의 같은 회차 번호를 못 지우게 한다 */
export async function deletePbSessPlan(evtId: string, sessNo: number): Promise<R> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };
  const parsedNo = pbSessNoSchema.safeParse(sessNo);
  if (!parsedNo.success) return { ok: false, message: firstIssue(parsedNo.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND };

    const { data, error } = await db
      .from("evt_pb_sess_plan")
      .delete()
      .eq("evt_id", parsedEvt.data)
      .eq("sess_no", parsedNo.data)
      .select("sess_no");
    if (error) return { ok: false, message: "훈련표 삭제에 실패했습니다" };
    if (!data || data.length === 0) return { ok: false, message: "훈련표를 찾을 수 없습니다" };

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 공식훈련 벙 한 번에 열기
// ─────────────────────────────────────────

/**
 * 아직 벙이 안 걸린 공식훈련 주차의 초안을 만든다(저장 안 함) — 관리자가 장소·시간을 고친 뒤
 * `createPbSessGatherings`로 한 번에 연다. 측정은 날짜 미정이라 초안에 없고, 이미 걸렸는지만 알려 준다.
 */
export async function getPbSessDrafts(
  evtId: string,
): Promise<
  { ok: true; message: null; drafts: PbSessDraft[]; measureLinked: boolean } | { ok: false; message: string }
> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error) };

  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false as const, message: NOT_FOUND };

    try {
      const [{ data: cfgRow, error: cfgError }, { data: links, error: linkError }, planRows] = await Promise.all([
        db.from("evt_pb_cfg").select("*").eq("evt_id", parsedEvt.data).maybeSingle(),
        // 삭제된 벙에 걸린 연결도 주차를 차지한다(주차당 연결 1개 제약) — del_yn 으로 거르지 않는다
        db.from("evt_gthr_rel").select("wk_no, sess_type_cd").eq("evt_id", parsedEvt.data),
        loadSessPlanRows(db, parsedEvt.data),
      ]);
      if (cfgError || linkError) throw new Error(cfgError?.message ?? linkError?.message);

      const rels = links ?? [];
      const drafts = buildSessDrafts({
        evtSttDt: evt.stt_dt,
        totSessCnt: cfgFromRow(cfgRow ?? null).totSessCnt,
        plans: toSessPlans(planRows),
        linkedWkNos: rels.map((r) => r.wk_no),
      });
      return {
        ok: true as const,
        message: null,
        drafts,
        measureLinked: rels.some((r) => r.sess_type_cd === "MEASURE"),
      };
    } catch (e) {
      console.error("[getPbSessDrafts]", e);
      return { ok: false as const, message: "벙 초안을 불러오지 못했습니다" };
    }
  });
}

function failMsg(created: number, why: string): string {
  return created > 0
    ? `${why}. 앞의 ${created}개는 이미 열렸어요 — 새로고침한 뒤 남은 것만 다시 열어 주세요`
    : why;
}

/**
 * 초안대로 벙(`gthr_mst`, 정기런)을 만들고 곧바로 이 프로젝트에 연결한다.
 *
 * - 정기런(`regular`)이다 — 개설 포인트는 일반(`general`) 벙에만 붙는다(기강포인트제도 §gthr_mst).
 * - 알림·단톡방 공지·개설자 자동 참석은 **하지 않는다** — 12개를 한꺼번에 알리면 스팸이다. 공지는 운영진이 따로 한다.
 * - 주차는 클라이언트 값을 믿지 않고 시작 시각에서 다시 계산해, 초안이 들고 온 `wkNo`와 다르면 거절한다.
 * - 벙을 만든 뒤 연결이 실패하면 그 벙을 소프트삭제해 연결 안 된 고아가 남지 않게 한다.
 *   중간에 실패하면 거기서 멈추고, 이미 연 것은 그대로 둔다(메시지에 개수를 적는다).
 */
export async function createPbSessGatherings(
  evtId: string,
  drafts: PbSessDraft[],
): Promise<{ ok: boolean; message: string | null; created: number }> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: firstIssue(parsedEvt.error), created: 0 };
  const parsedDrafts = pbSessDraftsSchema.safeParse(drafts);
  if (!parsedDrafts.success) return { ok: false, message: firstIssue(parsedDrafts.error), created: 0 };

  const res = await withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const evt = await guardEvent(db, parsedEvt.data, teamId);
    if (!evt) return { ok: false, message: NOT_FOUND, created: 0 };

    const [{ data: cfgRow, error: cfgError }, { data: links, error: linkError }] = await Promise.all([
      db.from("evt_pb_cfg").select("*").eq("evt_id", parsedEvt.data).maybeSingle(),
      db.from("evt_gthr_rel").select("wk_no, sess_type_cd").eq("evt_id", parsedEvt.data),
    ]);
    if (cfgError || linkError) return { ok: false, message: GENERIC_FAIL, created: 0 };

    const lastTrainingWk = cfgFromRow(cfgRow ?? null).totSessCnt - 1;
    const takenWk = new Set((links ?? []).map((l) => l.wk_no));
    const measureTaken = (links ?? []).some((l) => l.sess_type_cd === "MEASURE");

    // 전부 검증한 뒤에 쓴다 — 3번째 초안이 틀렸다고 앞의 둘만 열리는 일을 줄인다
    const rows: { d: PbSessDraft; startIso: string; endIso: string; wkNo: number }[] = [];
    const seenWk = new Set<number>();
    let measureCnt = 0;
    for (const d of parsedDrafts.data) {
      const label = d.gthrNm;
      const startIso = draftStartIso(d);
      // 존재하지 않는 날짜(2/31)는 dayjs 가 다음 달로 넘겨 버린다 — 되읽어 같은지 본다
      if (!dayjs(startIso).isValid() || formatKST(startIso, "YYYY-MM-DD") !== d.date) {
        return { ok: false, message: `'${label}' 날짜가 올바르지 않습니다`, created: 0 };
      }
      const wkNo = weekNoOf(startIso, evt.stt_dt);
      if (wkNo !== d.wkNo) {
        return {
          ok: false,
          message: `'${label}' 날짜가 ${wkNo}주차예요 (초안은 ${d.wkNo}주차). 날짜를 그 주차 안으로 맞춰 주세요`,
          created: 0,
        };
      }
      if (wkNo < 1) return { ok: false, message: `'${label}' 프로젝트 시작 전 날짜예요`, created: 0 };
      if (d.date > evt.end_dt) {
        return { ok: false, message: `'${label}' 프로젝트 종료일 이후 날짜예요`, created: 0 };
      }
      if (d.sessType === "TRAINING" && wkNo > lastTrainingWk) {
        return { ok: false, message: `'${label}' 공식훈련은 1~${lastTrainingWk}주차에만 열 수 있어요`, created: 0 };
      }
      if (d.sessType === "MEASURE") {
        measureCnt += 1;
        if (measureTaken || measureCnt > 1) {
          return { ok: false, message: "측정 일정은 하나만 지정할 수 있어요", created: 0 };
        }
      }
      if (takenWk.has(wkNo) || seenWk.has(wkNo)) {
        return { ok: false, message: `${wkNo}주차엔 이미 연결된 벙이 있어요`, created: 0 };
      }
      seenWk.add(wkNo);
      rows.push({ d, startIso, endIso: draftEndIso(d), wkNo });
    }

    let created = 0;
    for (const { d, startIso, endIso, wkNo } of rows) {
      const { data: gthr, error: gthrError } = await db
        .from("gthr_mst")
        .insert({
          team_id: teamId,
          gthr_nm: d.gthrNm,
          gthr_type_enm: "regular",
          sprt_cd: "running",
          stt_at: startIso,
          end_at: endIso,
          loc_txt: d.locTxt === "" ? null : d.locTxt,
          desc_txt: d.descTxt === "" ? null : d.descTxt,
          crt_by: member.id,
          del_yn: false,
        })
        .select("gthr_id")
        .single();
      if (gthrError || !gthr) {
        console.error("[createPbSessGatherings] gthr_mst insert", gthrError?.message);
        return { ok: false, message: failMsg(created, "벙을 만들지 못했습니다"), created };
      }

      const { error: relError } = await db.from("evt_gthr_rel").insert({
        gthr_id: gthr.gthr_id,
        evt_id: parsedEvt.data,
        wk_no: wkNo,
        sess_type_cd: d.sessType,
      });
      if (relError) {
        console.error("[createPbSessGatherings] evt_gthr_rel insert", relError.message);
        // 연결 안 된 벙이 일정에만 남지 않게 되돌린다(소프트삭제)
        const { error: undoError } = await db
          .from("gthr_mst")
          .update({ del_yn: true, upd_at: dayjs().toISOString() })
          .eq("gthr_id", gthr.gthr_id);
        if (undoError) console.error("[createPbSessGatherings] 되돌리기 실패", undoError.message);
        const why =
          relError.code === "23505" ? `${wkNo}주차엔 이미 연결된 벙이 있어요` : "프로젝트에 연결하지 못했습니다";
        return { ok: false, message: failMsg(created, why), created };
      }
      created += 1;
    }

    return { ok: true, message: `공식훈련 벙 ${created}개를 열었어요`, created };
  });

  // 하나라도 열렸으면 캘린더·프로젝트 화면 캐시를 턴다(중간 실패여도 이미 열린 건 보여야 한다).
  // updateTag: 즉시 만료 + read-your-own-writes — createGathering 이 쓰는 것과 같은 호출이다.
  const created = "created" in res ? res.created : 0;
  if (created > 0) {
    updateTag(HOME_CALENDAR_CACHE_TAG);
    revalidatePath("/projects");
  }
  return { ok: res.ok, message: res.message, created };
}
