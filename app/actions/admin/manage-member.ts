"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";

export async function approveMember(memberId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db
    .from("member")
    .update({ status: "active" })
    .eq("id", memberId)
    .eq("status", "pending");

  if (error) return { ok: false, message: "승인에 실패했습니다" };
  return { ok: true, message: null };
}

export async function rejectMember(memberId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db
    .from("member")
    .update({ status: "inactive" })
    .eq("id", memberId)
    .eq("status", "pending");

  if (error) return { ok: false, message: "거절에 실패했습니다" };
  return { ok: true, message: null };
}

export async function updateMemberStatus(
  memberId: string,
  status: "active" | "inactive",
) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db
    .from("member")
    .update({ status })
    .eq("id", memberId);

  if (error) return { ok: false, message: "상태 변경에 실패했습니다" };
  return { ok: true, message: null };
}

export async function toggleAdmin(memberId: string, isAdmin: boolean) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  if (admin.id === memberId) {
    return { ok: false, message: "본인의 관리자 권한은 변경할 수 없습니다" };
  }

  const db = createAdminClient();
  const { error } = await db
    .from("member")
    .update({ admin: isAdmin })
    .eq("id", memberId);

  if (error) return { ok: false, message: "변경에 실패했습니다" };
  return { ok: true, message: null };
}
