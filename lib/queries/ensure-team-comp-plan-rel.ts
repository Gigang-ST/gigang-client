import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 팀·대회에 대한 `team_comp_plan_rel`이 없으면 생성한다.
 * 참가 신청·기록 저장 시 첫 참여로 플랜을 만든다 (백필로 생긴 고아 행은 마이그레이션에서 제거).
 */
export async function ensureTeamCompPlanRel(
  supabase: SupabaseClient<Database>,
  teamId: string,
  compId: string,
): Promise<{ ok: true; teamCompId: string } | { ok: false; message: string }> {
  const { data: existing, error: selErr } = await supabase
    .from("team_comp_plan_rel")
    .select("team_comp_id")
    .eq("comp_id", compId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (selErr) {
    return { ok: false, message: selErr.message };
  }
  if (existing?.team_comp_id) {
    return { ok: true, teamCompId: existing.team_comp_id };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("team_comp_plan_rel")
    .insert({ team_id: teamId, comp_id: compId, vers: 0, del_yn: false })
    .select("team_comp_id")
    .maybeSingle();

  if (!insErr && inserted?.team_comp_id) {
    return { ok: true, teamCompId: inserted.team_comp_id };
  }

  if (insErr?.code === "23505") {
    const { data: again, error: againErr } = await supabase
      .from("team_comp_plan_rel")
      .select("team_comp_id")
      .eq("comp_id", compId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (!againErr && again?.team_comp_id) {
      return { ok: true, teamCompId: again.team_comp_id };
    }
  }

  return {
    ok: false,
    message: insErr?.message ?? "팀 대회 플랜을 만들지 못했습니다.",
  };
}
