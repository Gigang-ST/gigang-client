"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { createAdminClient } from "@/lib/supabase/admin";

export async function grantTitle(
  teamMemId: string,
  ttlId: string,
  teamId: string,
) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const db = createAdminClient();

  // ttl_mst 조회 + 중복 보유 확인을 단일 RPC로 처리
  const { data, error: rpcError } = await db.rpc("admin_grant_title", {
    p_team_mem_id: teamMemId,
    p_ttl_id: ttlId,
    p_team_id: teamId,
    p_granted_by: adminUser.id,
  });

  if (rpcError) return { ok: false as const, message: `${rpcError.code}: ${rpcError.message}` };
  if (data === "already_owned") return { ok: false as const, message: "이미 보유한 칭호입니다." };
  if (data === "title_not_found") return { ok: false as const, message: "칭호를 찾을 수 없습니다." };
  if (data !== "ok") return { ok: false as const, message: "수여에 실패했습니다." };

  return { ok: true as const, message: null };
}
