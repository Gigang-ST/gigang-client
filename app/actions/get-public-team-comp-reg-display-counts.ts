"use server";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export type PublicCompRegDisplayCountRow = {
  display_key: string;
  cnt: number;
};

/**
 * 비회원·로딩 등 RLS로 comp_reg_rel 상세를 못 읽을 때용: 표시 키별 인원만 (이름 없음).
 * `get_public_team_comp_reg_display_counts` SECURITY DEFINER.
 */
export async function getPublicTeamCompRegDisplayCounts(
  teamId: string,
  compId: string,
): Promise<{ ok: true; rows: PublicCompRegDisplayCountRow[] } | { ok: false; rows: []; message: string }> {
  const supabase = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const { data, error } = await supabase.rpc("get_public_team_comp_reg_display_counts", {
    p_team_id: teamId,
    p_comp_id: compId,
  });
  if (error) {
    console.error("get_public_team_comp_reg_display_counts:", error);
    return { ok: false, rows: [], message: error.message };
  }
  const rows = (data ?? []).map((r) => ({
    display_key: r.display_key,
    cnt: Number(r.cnt),
  }));
  return { ok: true, rows };
}
