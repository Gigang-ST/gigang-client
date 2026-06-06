import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";

import { DuesPolicyClient } from "./dues-policy-client";

export default async function DuesPolicyPage() {
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const [{ data: policies }, { data: feeItems }] = await Promise.all([
    supabase
      .from("fee_policy_cfg")
      .select("fee_policy_id, aply_stt_dt, aply_end_dt, monthly_fee_amt")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("aply_stt_dt", { ascending: false }),
    supabase
      .from("cmm_cd_mst")
      .select("cd_id, cd, cd_nm, sort_ord, is_default_yn, cmm_cd_grp_mst!inner(cd_grp_cd)")
      .eq("cmm_cd_grp_mst.cd_grp_cd", "FEE_ITEM_CD")
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("sort_ord", { ascending: true }),
  ]);

  const cleanedFeeItems = (feeItems ?? []).map(({ cmm_cd_grp_mst: _, ...rest }) => rest);

  return <DuesPolicyClient policies={policies ?? []} feeItems={cleanedFeeItems} />;
}
