"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { GIGANG_TEAM_ID } from "@/lib/constants/gigang-team";

export async function approveMember(memberId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error: e1 } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "active" })
    .eq("mem_id", memberId)
    .eq("team_id", GIGANG_TEAM_ID)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "pending");

  if (e1) return { ok: false, message: "승인에 실패했습니다" };

  return { ok: true, message: null };
}

export async function rejectMember(memberId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error: e1 } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "inactive" })
    .eq("mem_id", memberId)
    .eq("team_id", GIGANG_TEAM_ID)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "pending");

  if (e1) return { ok: false, message: "거절에 실패했습니다" };

  return { ok: true, message: null };
}

export async function updateMemberStatus(
  memberId: string,
  status: "active" | "inactive",
) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const memSt = status;

  const { error: e1 } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: memSt })
    .eq("mem_id", memberId)
    .eq("team_id", GIGANG_TEAM_ID)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (e1) return { ok: false, message: "상태 변경에 실패했습니다" };

  return { ok: true, message: null };
}

export async function toggleAdmin(memberId: string, isAdmin: boolean) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  if (admin.id === memberId) {
    return { ok: false, message: "본인의 관리자 권한은 변경할 수 없습니다" };
  }

  const db = createAdminClient();
  const { data: rel, error: relErr } = await db
    .from("team_mem_rel")
    .select("team_role_cd")
    .eq("mem_id", memberId)
    .eq("team_id", GIGANG_TEAM_ID)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (relErr || !rel) return { ok: false, message: "변경에 실패했습니다" };
  if (rel.team_role_cd === "owner") {
    return { ok: false, message: "크루장 권한은 변경할 수 없습니다" };
  }

  const newRole = isAdmin ? "admin" : "member";
  const { error: e1 } = await db
    .from("team_mem_rel")
    .update({ team_role_cd: newRole })
    .eq("mem_id", memberId)
    .eq("team_id", GIGANG_TEAM_ID)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (e1) return { ok: false, message: "변경에 실패했습니다" };

  return { ok: true, message: null };
}
