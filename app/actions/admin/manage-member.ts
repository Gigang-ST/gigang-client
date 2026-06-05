"use server";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export async function approveMember(memberId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();
  const { error: e1 } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "active" })
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "pending");

  if (e1) return { ok: false, message: "승인에 실패했습니다" };

  return { ok: true, message: null };
}

export async function rejectMember(memberId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();
  const { error: e1 } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "inactive" })
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "pending");

  if (e1) return { ok: false, message: "거절에 실패했습니다" };

  return { ok: true, message: null };
}

export async function toggleAdmin(memberId: string, isAdmin: boolean) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  if (adminUser.id === memberId) {
    return { ok: false, message: "본인의 관리자 권한은 변경할 수 없습니다" };
  }

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();
  const { data: rel, error: relErr } = await db
    .from("team_mem_rel")
    .select("team_role_cd")
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (relErr || !rel) return { ok: false, message: "변경에 실패했습니다" };
  if (rel.team_role_cd === "owner") {
    return { ok: false, message: "크루장 권한은 변경할 수 없습니다" };
  }

  const newRole = isAdmin ? "admin" : "member";
  // owner 는 UPDATE 조건에 넣어 읽기·갱신 사이 owner 승격 TOCTOU 로 크루장이 강등되는 것을 방지
  const { data: updated, error: e1 } = await db
    .from("team_mem_rel")
    .update({ team_role_cd: newRole })
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .neq("team_role_cd", "owner")
    .select("team_mem_id");

  if (e1) return { ok: false, message: "변경에 실패했습니다" };
  if (!updated?.length) {
    return {
      ok: false,
      message:
        "변경이 반영되지 않았습니다. 크루장이거나 다른 작업과 겹쳤을 수 있으니 새로고침 후 다시 시도해 주세요.",
    };
  }

  return { ok: true, message: null };
}

export async function deleteMember(memberId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  if (adminUser.id === memberId) {
    return { ok: false, message: "본인은 삭제할 수 없습니다" };
  }

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data: rel } = await db
    .from("team_mem_rel")
    .select("team_role_cd")
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  if (rel?.team_role_cd === "owner") {
    return { ok: false, message: "크루장은 삭제할 수 없습니다" };
  }

  const { error } = await db
    .from("team_mem_rel")
    .update({ del_yn: true })
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (error) return { ok: false, message: "삭제에 실패했습니다" };

  return { ok: true, message: null };
}

export async function deactivateMember(memberId: string, reason?: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  if (adminUser.id === memberId) {
    return { ok: false, message: "본인을 비활성화할 수 없습니다" };
  }

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { data: updated, error } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "inactive", inact_rsn_txt: reason ?? null })
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "active")
    .neq("team_role_cd", "owner")
    .select("team_mem_id");

  if (error) return { ok: false, message: "비활성화에 실패했습니다" };
  if (!updated?.length) return { ok: false, message: "비활성화할 수 있는 대상이 아닙니다" };
  return { ok: true, message: null };
}

export async function reactivateMember(memberId: string) {
  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { error } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "active", inact_rsn_txt: null })
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "inactive");

  if (error) return { ok: false, message: "활성화에 실패했습니다" };
  return { ok: true, message: null };
}

export async function batchDeactivateMembers(memberIds: string[], reason?: string) {
  if (!memberIds.length) return { ok: false, message: "대상이 없습니다" };

  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  // 본인 및 크루장 제외
  const { data: rels } = await db
    .from("team_mem_rel")
    .select("mem_id, team_role_cd")
    .in("mem_id", memberIds)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  const safeIds = (rels ?? [])
    .filter((r) => r.mem_id !== adminUser.id && r.team_role_cd !== "owner")
    .map((r) => r.mem_id);

  if (!safeIds.length) return { ok: false, message: "처리 가능한 대상이 없습니다" };

  const { error } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "inactive", inact_rsn_txt: reason ?? null })
    .in("mem_id", safeIds)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "active");

  if (error) return { ok: false, message: "일괄 비활성화에 실패했습니다" };
  return { ok: true, message: null };
}

export async function batchReactivateMembers(memberIds: string[]) {
  if (!memberIds.length) return { ok: false, message: "대상이 없습니다" };

  const adminUser = await verifyAdmin();
  if (!adminUser) return { ok: false, message: "권한이 없습니다" };

  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const { error } = await db
    .from("team_mem_rel")
    .update({ mem_st_cd: "active", inact_rsn_txt: null })
    .in("mem_id", memberIds)
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "inactive");

  if (error) return { ok: false, message: "일괄 활성화에 실패했습니다" };
  return { ok: true, message: null };
}
