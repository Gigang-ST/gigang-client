"use server";

import { revalidatePath } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { nowKST, todayKST } from "@/lib/dayjs";
import { PB_CLASS_TYPE, currentWeekNo, feesForJoinWeek } from "@/lib/pb-class";
import { canEditGoal, goalEditLastWk, ruleFromJson } from "@/lib/pb-class-score";
import { cfgFromRow, isMileageAlumni } from "@/lib/queries/pb-class";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkGoalCap, pbEvtIdSchema, pbGoalSecSchema, pbRecSecSchema } from "@/lib/validations/pb-class";

type ActionResult = { ok: boolean; message: string | null };

/**
 * 겨울 10K PB 클래스 참가 신청.
 *
 * 금액·합류 주차는 **클라이언트가 보내지 않는다** — 오늘 날짜와 프로젝트 설정에서 서버가 정한다.
 * 보증금이 걸린 값이라 사용자가 4만 원짜리를 1만 원으로 신청할 길을 아예 두지 않는다.
 * 신청은 입금 대기(`aprv_yn=false`)로 들어가고, 운영진이 입금을 확인해 승인한다(마일리지런과 같은 흐름).
 *
 * 쓰기는 service role 이다(`evt_pb_prt_rel`에 쓰기 정책이 없다). RLS 백스톱이 없으므로
 * **팀·타입·상태·기간을 여기서 전부 직접 판정**한다.
 */
export async function joinPbClass(evtId: string): Promise<ActionResult> {
  const parsed = pbEvtIdSchema.safeParse(evtId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "잘못된 요청입니다" };

  try {
    return await withActive(async ({ member }) => {
      const { teamId } = await getRequestTeamContext();
      const db = createAdminClient();

      const { data: evt, error: evtError } = await db
        .from("evt_team_mst")
        .select("team_id, evt_type_cd, stts_enm, stt_dt, end_dt")
        .eq("evt_id", parsed.data)
        .maybeSingle();
      // 다른 팀·다른 종류의 프로젝트는 존재 여부도 알려 주지 않는다(같은 문구)
      if (evtError || !evt || evt.team_id !== teamId || evt.evt_type_cd !== PB_CLASS_TYPE) {
        return { ok: false, message: "프로젝트를 찾을 수 없습니다" };
      }
      if (evt.stts_enm !== "ACTIVE") return { ok: false, message: "지금은 참가 신청을 받지 않는 프로젝트입니다" };
      // 날짜 개념이 끼는 판정이라 KST 로 맞춘다(UTC 서버에서 KST 00~09시에 하루 밀린다)
      if (todayKST() > evt.end_dt) return { ok: false, message: "이미 종료된 프로젝트입니다" };

      const { data: cfgRow, error: cfgError } = await db
        .from("evt_pb_cfg")
        .select("*")
        .eq("evt_id", parsed.data)
        .maybeSingle();
      if (cfgError) return { ok: false, message: "참가 신청에 실패했습니다" };
      const cfg = cfgFromRow(cfgRow);

      // 마일리지런 참가 이력은 클라이언트가 아니라 서버가 판정한다 — 화면의 `mlgAlumni`는 표시용일 뿐이다.
      // 조회가 실패하면 신청을 막는다: 「이력 없음」으로 눙치면 할인 대상자가 말없이 더 낸다.
      let mlgAlumni: boolean;
      try {
        mlgAlumni = await isMileageAlumni(db, teamId, member.id);
      } catch (e) {
        console.error("[joinPbClass] 마일리지런 이력 조회 실패", e);
        return { ok: false, message: "참가 신청에 실패했습니다" };
      }

      const joinWkNo = currentWeekNo(evt.stt_dt, nowKST().toISOString());
      const fees = feesForJoinWeek(joinWkNo, cfg, { mlgAlumni });

      const { error } = await db.from("evt_pb_prt_rel").insert({
        evt_id: parsed.data,
        mem_id: member.id,
        join_wk_no: joinWkNo,
        deposit_amt: fees.depositAmt,
        deposit_dc_amt: fees.depositDcAmt,
        entry_fee_amt: fees.entryFeeAmt,
        aprv_yn: false,
      });
      if (error) {
        if (error.code === "23505") return { ok: false, message: "이미 참가 신청하셨습니다" };
        return { ok: false, message: "참가 신청에 실패했습니다" };
      }

      revalidatePath("/projects");
      return { ok: true, message: null };
    });
  } catch (e) {
    // withActive 가 비활성·미로그인을 throw 로 알린다 — 그 사유 문구를 사용자에게 그대로 보여 준다
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}

/**
 * 내 참가 행을 찾는다 — 목표·기록 액션이 공유한다.
 *
 * 쓰기가 service role 이라 RLS 백스톱이 없으므로 **팀·종류·상태를 여기서 직접 판정**한다(`joinPbClass`와 같다).
 * 신청 대기(`aprv_yn=false`)도 행이 있으므로 돌려준다 — 승인 여부는 호출부가 필요할 때 본다.
 * 기간(`end_dt`)은 보지 않는다: 대구마라톤 10K 같은 사후 기록이 프로젝트 종료일 뒤에 들어올 수 있고,
 * 열어 둘지 닫을지는 운영진이 `stts_enm`(ACTIVE/CLOSED)으로 정한다.
 */
async function findMyPbParticipation(
  db: ReturnType<typeof createAdminClient>,
  evtId: string,
  teamId: string,
  memId: string,
): Promise<
  | { ok: true; prtId: string; aprvYn: boolean; joinWkNo: number; sttDt: string }
  | { ok: false; message: string }
> {
  const { data: evt, error: evtError } = await db
    .from("evt_team_mst")
    .select("team_id, evt_type_cd, stts_enm, stt_dt")
    .eq("evt_id", evtId)
    .maybeSingle();
  // 다른 팀·다른 종류의 프로젝트는 존재 여부도 알려 주지 않는다(같은 문구)
  if (evtError || !evt || evt.team_id !== teamId || evt.evt_type_cd !== PB_CLASS_TYPE) {
    return { ok: false, message: "프로젝트를 찾을 수 없습니다" };
  }
  if (evt.stts_enm !== "ACTIVE") return { ok: false, message: "지금은 수정할 수 없는 프로젝트입니다" };

  const { data: prt, error: prtError } = await db
    .from("evt_pb_prt_rel")
    .select("prt_id, aprv_yn, join_wk_no")
    .eq("evt_id", evtId)
    .eq("mem_id", memId)
    .maybeSingle();
  if (prtError) return { ok: false, message: "처리에 실패했습니다" };
  if (!prt) return { ok: false, message: "참가 신청 후에 이용할 수 있어요" };
  return { ok: true, prtId: prt.prt_id, aprvYn: prt.aprv_yn, joinWkNo: prt.join_wk_no, sttDt: evt.stt_dt };
}

/**
 * 내 10K 목표 설정(null 이면 지움).
 *
 * 마감은 서버가 판정한다 — 버튼을 감추는 건 안내일 뿐이다. 마감 주차(`goalEditUntilWk`)가 지나면 회원은
 * 못 고친다(점수를 보고 목표를 끼워 맞추는 걸 막는다). 운영진은 `setPbGoalByAdmin`으로 우회한다.
 * 목표는 입금 대기 중에도 정할 수 있다 — 승인 전에도 W2 마감은 흐르기 때문이다.
 */
export async function setMyPbGoal(evtId: string, goalSec: number | null): Promise<ActionResult> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: parsedEvt.error.issues[0]?.message ?? "잘못된 요청입니다" };
  const parsedGoal = pbGoalSecSchema.nullable().safeParse(goalSec);
  if (!parsedGoal.success) return { ok: false, message: parsedGoal.error.issues[0]?.message ?? "잘못된 요청입니다" };

  try {
    return await withActive(async ({ member }) => {
      const { teamId } = await getRequestTeamContext();
      const db = createAdminClient();

      const mine = await findMyPbParticipation(db, parsedEvt.data, teamId, member.id);
      if (!mine.ok) return mine;

      const { data: cfgRow, error: cfgError } = await db
        .from("evt_pb_cfg")
        .select("rule_json")
        .eq("evt_id", parsedEvt.data)
        .maybeSingle();
      if (cfgError) return { ok: false, message: "목표 저장에 실패했습니다" };
      const rule = ruleFromJson(cfgRow?.rule_json);

      const wkNo = currentWeekNo(mine.sttDt, nowKST().toISOString());
      if (!canEditGoal(wkNo, rule, mine.joinWkNo)) {
        return { ok: false, message: `목표는 W${goalEditLastWk(rule, mine.joinWkNo)}까지만 고칠 수 있어요` };
      }
      if (parsedGoal.data !== null) {
        const capMsg = checkGoalCap(parsedGoal.data, rule);
        if (capMsg) return { ok: false, message: capMsg };
      }

      const { error } = await db
        .from("evt_pb_prt_rel")
        .update({ goal_sec: parsedGoal.data, updated_at: nowKST().toISOString() })
        .eq("prt_id", mine.prtId);
      if (error) return { ok: false, message: "목표 저장에 실패했습니다" };

      revalidatePath("/projects");
      return { ok: true, message: null };
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}

/**
 * 내 대구마라톤 10K 기록 입력·삭제.
 *
 * 승인된 참가자만 — 입금 확인 전 신청자의 기록이 점수판 근처에 오가는 걸 막는다.
 * 본인이 올린 기록은 **확인 전(`cnfm_yn=false`)** 으로 들어가고 운영진이 확인해야 점수·달성 판정에 쓰인다
 * (기록 입력은 거짓말 한 줄이면 점수가 나는 자리라 사람 눈을 거친다).
 *
 * 이미 확인된 기록은 회원이 고치거나 지울 수 없다(운영진에게 문의). 고치게 두면 확인된 기록이 조용히
 * 미확인으로 돌아가 점수가 사라지는데 본인도 운영진도 모른다. 쓰기는 `cnfm_yn=false` 조건을 함께 걸어
 * 읽고 쓰는 사이에 운영진이 확인해도 덮어쓰지 않게 한다.
 */
export async function setMyDaeguRecord(evtId: string, recSec: number | null): Promise<ActionResult> {
  const parsedEvt = pbEvtIdSchema.safeParse(evtId);
  if (!parsedEvt.success) return { ok: false, message: parsedEvt.error.issues[0]?.message ?? "잘못된 요청입니다" };
  const parsedSec = pbRecSecSchema.nullable().safeParse(recSec);
  if (!parsedSec.success) return { ok: false, message: parsedSec.error.issues[0]?.message ?? "잘못된 요청입니다" };

  try {
    return await withActive(async ({ member }) => {
      const { teamId } = await getRequestTeamContext();
      const db = createAdminClient();

      const mine = await findMyPbParticipation(db, parsedEvt.data, teamId, member.id);
      if (!mine.ok) return mine;
      if (!mine.aprvYn) return { ok: false, message: "참가 승인 후에 기록을 입력할 수 있어요" };

      const { data: existing, error: readError } = await db
        .from("evt_pb_rec_hist")
        .select("rec_id, cnfm_yn")
        .eq("prt_id", mine.prtId)
        .eq("rec_type_cd", "DAEGU_10K")
        .maybeSingle();
      if (readError) return { ok: false, message: "기록 저장에 실패했습니다" };
      if (existing?.cnfm_yn) return { ok: false, message: "이미 확인된 기록은 고칠 수 없어요. 운영진에게 문의해 주세요" };

      // 조건부 쓰기가 0행이면 그 사이 운영진이 확인한 것이다 — 성공으로 눙치지 않고 알린다
      const CONFIRMED_NOW = "방금 운영진이 확인한 기록이에요. 고치려면 운영진에게 문의해 주세요";
      const now = nowKST().toISOString();
      if (parsedSec.data === null) {
        if (existing) {
          const { data, error } = await db
            .from("evt_pb_rec_hist")
            .delete()
            .eq("rec_id", existing.rec_id)
            .eq("cnfm_yn", false)
            .select("rec_id");
          if (error) return { ok: false, message: "기록 삭제에 실패했습니다" };
          if (!data || data.length === 0) return { ok: false, message: CONFIRMED_NOW };
        }
      } else if (existing) {
        const { data, error } = await db
          .from("evt_pb_rec_hist")
          .update({ rec_sec: parsedSec.data, cnfm_yn: false, crt_by: member.id, updated_at: now })
          .eq("rec_id", existing.rec_id)
          .eq("cnfm_yn", false)
          .select("rec_id");
        if (error) return { ok: false, message: "기록 저장에 실패했습니다" };
        if (!data || data.length === 0) return { ok: false, message: CONFIRMED_NOW };
      } else {
        const { error } = await db.from("evt_pb_rec_hist").insert({
          prt_id: mine.prtId,
          rec_type_cd: "DAEGU_10K",
          rec_sec: parsedSec.data,
          cnfm_yn: false,
          crt_by: member.id,
        });
        if (error) return { ok: false, message: "기록 저장에 실패했습니다" };
      }

      revalidatePath("/projects");
      return { ok: true, message: null };
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
