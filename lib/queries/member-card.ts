import type { MemberCardData } from "@/lib/member-card";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

import type { SupabaseClient } from "@supabase/supabase-js";

/** RPC jsonb 결과를 MemberCardData 로 캐스팅 (RPC 가 단일 jsonb 반환) */
function castCard(data: unknown): MemberCardData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as MemberCardData;
}

/** 클라이언트(브라우저)에서 호출 — 랭킹 팝업용 */
export async function fetchMemberCardClient(
  memId: string,
  teamId: string,
): Promise<MemberCardData | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_public_member_card", {
    p_mem_id: memId,
    p_team_id: teamId,
  });
  if (error) throw error;
  return castCard(data);
}

/** 서버에서 호출 — 본인 프로필용 (전달받은 supabase 재사용) */
export async function getMemberCard(
  supabase: SupabaseClient<Database>,
  memId: string,
  teamId: string,
): Promise<MemberCardData | null> {
  const { data, error } = await supabase.rpc("get_public_member_card", {
    p_mem_id: memId,
    p_team_id: teamId,
  });
  if (error) throw error;
  return castCard(data);
}
