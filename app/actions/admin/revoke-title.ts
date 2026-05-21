"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { createAdminClient } from "@/lib/supabase/admin";

export async function revokeTitle(memTtlId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false as const, message: "권한이 없습니다." };

  const db = createAdminClient();

  // 현재 활성 행의 vers 조회
  const { data: row } = await db
    .from("mem_ttl_rel")
    .select("vers")
    .eq("mem_ttl_id", memTtlId)
    .eq("del_yn", false)
    .maybeSingle();

  if (!row) return { ok: false as const, message: "보유 칭호를 찾을 수 없습니다." };

  // 회수: vers+1 + del_yn=true — vers=0 슬롯을 비워야 재수여 시 UNIQUE 충돌이 없다
  const { error } = await db
    .from("mem_ttl_rel")
    .update({ del_yn: true, vers: row.vers + 1, pt_chg_rsn_cd: "revoke" })
    .eq("mem_ttl_id", memTtlId);

  if (error) return { ok: false as const, message: "회수에 실패했습니다." };
  return { ok: true as const, message: null };
}
