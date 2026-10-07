"use server";

import { revalidatePath } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { nowKST, todayKST } from "@/lib/dayjs";
import { PB_CLASS_TYPE, currentWeekNo, feesForJoinWeek } from "@/lib/pb-class";
import { cfgFromRow } from "@/lib/queries/pb-class";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { pbEvtIdSchema } from "@/lib/validations/pb-class";

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

      const joinWkNo = currentWeekNo(evt.stt_dt, nowKST().toISOString());
      const fees = feesForJoinWeek(joinWkNo, cfg);

      const { error } = await db.from("evt_pb_prt_rel").insert({
        evt_id: parsed.data,
        mem_id: member.id,
        join_wk_no: joinWkNo,
        deposit_amt: fees.depositAmt,
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
