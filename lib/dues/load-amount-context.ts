import { projectAmountsOf, type ProjectFeeRule } from "@/lib/dues/amount-hint";
import { PB_CLASS_TYPE } from "@/lib/pb-class";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

type AdminDb = SupabaseClient<Database>;

/** 월회비 단가를 못 읽을 때의 기본값 — getDuesLedger 와 같은 값 */
const DEFAULT_MONTHLY_FEE_AMT = 2000;

export type AmountContext = {
  rules: ProjectFeeRule[];
  monthlyFeeAmt: number;
};

/**
 * 금액 힌트(#708)에 필요한 팀 맥락 — 진행 중(ACTIVE) 프로젝트의 참가비 규칙 + 월회비 단가.
 * 프로젝트는 타입이 여럿이고 ACTIVE 가 둘 이상일 수 있어(.maybeSingle() 금지) 전부 읽는다.
 * 참가비가 있는 건 지금 PB_CLASS 뿐이다 — 마일리지런은 참가비 입금이 없다.
 * 조회 실패는 던진다: 삼키면 힌트 없이 회비로 자동 확정돼 이번 사고가 되풀이된다.
 */
export async function loadAmountContext(db: AdminDb, teamId: string): Promise<AmountContext> {
  const { data: policies, error: policyErr } = await db
    .from("fee_policy_cfg")
    .select("monthly_fee_amt")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("aply_stt_dt", { ascending: false })
    .limit(1);
  if (policyErr) throw new Error(`회비 정책 조회 실패: ${policyErr.message}`);
  const monthlyFeeAmt = Number(policies?.[0]?.monthly_fee_amt ?? DEFAULT_MONTHLY_FEE_AMT);

  const { data: evts, error: evtErr } = await db
    .from("evt_team_mst")
    .select("evt_id, evt_nm")
    .eq("team_id", teamId)
    .eq("evt_type_cd", PB_CLASS_TYPE)
    .eq("stts_enm", "ACTIVE");
  if (evtErr) throw new Error(`진행 중 프로젝트 조회 실패: ${evtErr.message}`);
  if (!evts?.length) return { rules: [], monthlyFeeAmt };

  const evtIds = evts.map((e) => e.evt_id);
  const { data: cfgs, error: cfgErr } = await db
    .from("evt_pb_cfg")
    .select("evt_id, deposit_amt, entry_fee_amt, mlg_dc_amt")
    .in("evt_id", evtIds);
  if (cfgErr) throw new Error(`프로젝트 참가비 설정 조회 실패: ${cfgErr.message}`);

  const prts = await fetchAllRows(() =>
    db
      .from("evt_pb_prt_rel")
      .select("prt_id, evt_id, mem_id, deposit_amt, entry_fee_amt")
      .in("evt_id", evtIds)
      .order("prt_id"),
  );

  const rules: ProjectFeeRule[] = evts.map((e) => {
    const cfg = cfgs?.find((c) => c.evt_id === e.evt_id);
    const mine = prts.filter((p) => p.evt_id === e.evt_id);
    return {
      evtId: e.evt_id,
      evtNm: e.evt_nm,
      amounts: projectAmountsOf({
        // 설정 행이 아직 없으면(관리자가 저장 전) 참가자 실제 금액만으로 대조한다
        depositAmt: cfg?.deposit_amt ?? 0,
        entryFeeAmt: cfg?.entry_fee_amt ?? 0,
        mlgDcAmt: cfg?.mlg_dc_amt ?? 0,
        participants: mine.map((p) => ({ depositAmt: p.deposit_amt, entryFeeAmt: p.entry_fee_amt })),
      }),
      registrantMemIds: mine.map((p) => p.mem_id),
    };
  });

  return { rules, monthlyFeeAmt };
}
