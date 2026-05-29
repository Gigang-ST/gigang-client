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

  // 칭호 존재 여부 확인
  const { data: title } = await db
    .from("ttl_mst")
    .select("ttl_id")
    .eq("ttl_id", ttlId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (!title) return { ok: false as const, message: "칭호를 찾을 수 없습니다." };

  // 중복 수여 방지 — 현재 활성(vers=0, del_yn=false) 보유 중이면 거절
  const { data: existing } = await db
    .from("mem_ttl_rel")
    .select("mem_ttl_id")
    .eq("team_mem_id", teamMemId)
    .eq("ttl_id", ttlId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (existing) return { ok: false as const, message: "이미 보유한 칭호입니다." };

  // 수여 — 회수 시 vers가 올라가므로 vers=0 슬롯이 비어있어 재수여도 문제없다
  const { error } = await db.from("mem_ttl_rel").insert({
    team_id: teamId,
    team_mem_id: teamMemId,
    ttl_id: ttlId,
    grnt_by_mem_id: adminUser.id,
    grnt_rsn_txt: "관리자 수동 수여",
    is_prmy_yn: false,
    vers: 0,
    del_yn: false,
  });

  if (error) return { ok: false as const, message: "수여에 실패했습니다." };
  return { ok: true as const, message: null };
}
