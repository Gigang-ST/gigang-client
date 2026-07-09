import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

import { DuesExemptionsClient } from "./dues-exemptions-client";

export default async function DuesExemptionsPage() {
  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const [{ data: exemptions }, { data: hists }, { data: members }] = await Promise.all([
    // 면제 규칙
    db
      .from("fee_due_exm_cfg")
      .select(
        "exm_cfg_id, mem_id, exm_tp_enm, exm_amt, aply_stt_dt, aply_end_dt, rsn_txt, mem_mst!fk_fee_due_exm_cfg__mem_mst(mem_nm, birth_dt), reg:mem_mst!fk_fee_due_exm_cfg__reg_mem_mst(mem_nm)",
      )
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("aply_stt_dt", { ascending: false }),
    // 면제 이력
    db
      .from("fee_due_exm_hist")
      .select(
        "exm_hist_id, mem_id, aply_ym, exm_amt, grant_src_enm, rsn_txt, mem_mst!fk_fee_due_exm_hist__mem_mst(mem_nm, birth_dt), aprv:mem_mst!fk_fee_due_exm_hist__aprv_mem_mst(mem_nm)",
      )
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("aply_ym", { ascending: false }),
    // 회원 목록 (추가 폼용)
    db
      .from("mem_mst")
      .select("mem_id, mem_nm, birth_dt, team_mem_rel!inner(team_id)")
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("team_mem_rel.team_id", teamId)
      .eq("team_mem_rel.vers", 0)
      .eq("team_mem_rel.del_yn", false)
      .order("mem_nm"),
  ]);

  const pickNm = (rel: unknown) =>
    Array.isArray(rel) ? (rel[0]?.mem_nm ?? "-") : ((rel as { mem_nm: string } | null)?.mem_nm ?? "-");
  const pickBirthDt = (rel: unknown) =>
    Array.isArray(rel) ? (rel[0]?.birth_dt ?? null) : ((rel as { birth_dt: string | null } | null)?.birth_dt ?? null);

  const exemptionList = (exemptions ?? []).map((e) => ({
    exm_cfg_id: e.exm_cfg_id,
    mem_id: e.mem_id,
    mem_nm: pickNm(e.mem_mst),
    birth_dt: pickBirthDt(e.mem_mst),
    exm_tp_enm: e.exm_tp_enm as "full" | "part",
    exm_amt: e.exm_amt ?? null,
    aply_stt_dt: e.aply_stt_dt,
    aply_end_dt: e.aply_end_dt,
    rsn_txt: e.rsn_txt,
    reg_by_mem_nm: pickNm(e.reg),
  }));

  const histList = (hists ?? []).map((h) => ({
    exm_hist_id: h.exm_hist_id,
    mem_id: h.mem_id,
    mem_nm: pickNm(h.mem_mst),
    birth_dt: pickBirthDt(h.mem_mst),
    aply_ym: h.aply_ym,
    exm_amt: h.exm_amt,
    grant_src_enm: h.grant_src_enm as "manual" | "rule_attd" | "rule_attd_quest",
    rsn_txt: h.rsn_txt ?? "",
    aprv_by_mem_nm: pickNm(h.aprv),
  }));

  const memberList = (members ?? []).map((m) => ({ mem_id: m.mem_id, mem_nm: m.mem_nm, birth_dt: m.birth_dt ?? null }));

  return <DuesExemptionsClient exemptions={exemptionList} hists={histList} members={memberList} />;
}
