"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("member")
    .select("id, admin")
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();

  if (!member?.admin) return null;
  return member;
}

export type PendingParticipation = {
  id: string;
  project_id: string;
  member_id: string;
  start_month: string;
  initial_goal: number;
  singlet_fee_paid: boolean;
  created_at: string;
  member: {
    full_name: string | null;
  };
};

/** 보증금 미확인 참여 신청 목록 조회 */
export async function getPendingParticipations(projectId: string) {
  const admin = await verifyAdmin();
  if (!admin)
    return { ok: false as const, message: "권한이 없습니다", data: [] };

  const db = createAdminClient();
  const { data, error } = await db
    .from("project_participation")
    .select("id, project_id, member_id, start_month, initial_goal, singlet_fee_paid, created_at, member(full_name)")
    .eq("project_id", projectId)
    .eq("deposit_confirmed", false)
    .order("created_at", { ascending: false });

  if (error)
    return { ok: false as const, message: "조회에 실패했습니다", data: [] };
  return {
    ok: true as const,
    message: null,
    data: (data ?? []).map((d) => ({
      ...d,
      member: Array.isArray(d.member) ? d.member[0] : d.member,
    })) as PendingParticipation[],
  };
}

/** 보증금 확인 승인 */
export async function confirmDeposit(participationId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db
    .from("project_participation")
    .update({ deposit_confirmed: true })
    .eq("id", participationId)
    .eq("deposit_confirmed", false);

  if (error) return { ok: false, message: "승인에 실패했습니다" };
  return { ok: true, message: null };
}

export type ConfirmedParticipation = {
  id: string;
  project_id: string;
  member_id: string;
  start_month: string;
  initial_goal: number;
  singlet_fee_paid: boolean;
  created_at: string;
  member: {
    full_name: string | null;
  };
};

/** 승인된 참여자 목록 조회 */
export async function getConfirmedParticipations(projectId: string) {
  const admin = await verifyAdmin();
  if (!admin)
    return { ok: false as const, message: "권한이 없습니다", data: [] };

  const db = createAdminClient();
  const { data, error } = await db
    .from("project_participation")
    .select("id, project_id, member_id, start_month, initial_goal, singlet_fee_paid, created_at, member(full_name)")
    .eq("project_id", projectId)
    .eq("deposit_confirmed", true)
    .order("created_at", { ascending: true });

  if (error)
    return { ok: false as const, message: "조회에 실패했습니다", data: [] };
  return {
    ok: true as const,
    message: null,
    data: (data ?? []).map((d) => ({
      ...d,
      member: Array.isArray(d.member) ? d.member[0] : d.member,
    })) as ConfirmedParticipation[],
  };
}

/** 참여 신청 거절 (레코드 삭제) */
export async function rejectParticipation(participationId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db
    .from("project_participation")
    .delete()
    .eq("id", participationId)
    .eq("deposit_confirmed", false);

  if (error) return { ok: false, message: "거절에 실패했습니다" };
  return { ok: true, message: null };
}
