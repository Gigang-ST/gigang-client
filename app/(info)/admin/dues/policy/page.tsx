import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";
import { DuesPolicyClient } from "./dues-policy-client";

export default async function DuesPolicyPage() {
  const { teamId } = await getRequestTeamContext();
  const supabase = await createClient();

  const { data: policies } = await supabase
    .from("fee_policy_cfg")
    .select("fee_policy_id, aply_stt_dt, aply_end_dt, monthly_fee_amt")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("aply_stt_dt", { ascending: false });

  return <DuesPolicyClient policies={policies ?? []} />;
}
