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

export type Project = {
  id: string;
  name: string;
  start_month: string;
  end_month: string;
  status: "active" | "ended";
  created_at: string;
};

export async function getProjects() {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false as const, message: "권한이 없습니다", data: [] };

  const db = createAdminClient();
  const { data, error } = await db
    .from("project")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { ok: false as const, message: "조회에 실패했습니다", data: [] };
  return { ok: true as const, message: null, data: (data ?? []) as Project[] };
}

export async function createProject(input: {
  name: string;
  start_month: string;
  end_month: string;
}) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db.from("project").insert({
    name: input.name.trim(),
    start_month: input.start_month,
    end_month: input.end_month,
  });

  if (error) return { ok: false, message: "추가에 실패했습니다" };
  return { ok: true, message: null };
}

export async function updateProject(
  id: string,
  input: {
    name?: string;
    start_month?: string;
    end_month?: string;
    status?: "active" | "ended";
  },
) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.start_month !== undefined) updateData.start_month = input.start_month;
  if (input.end_month !== undefined) updateData.end_month = input.end_month;
  if (input.status !== undefined) updateData.status = input.status;

  const { error } = await db
    .from("project")
    .update(updateData)
    .eq("id", id);

  if (error) return { ok: false, message: "수정에 실패했습니다" };
  return { ok: true, message: null };
}

export async function deleteProject(id: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db.from("project").delete().eq("id", id);

  if (error) return { ok: false, message: "삭제에 실패했습니다" };
  return { ok: true, message: null };
}

/** 활성 프로젝트 수 조회 (관리자 대시보드용) */
export async function getActiveProjectCount() {
  const db = createAdminClient();
  const { count, error } = await db
    .from("project")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  if (error) return 0;
  return count ?? 0;
}
