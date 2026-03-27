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

export type EventMultiplier = {
  id: string;
  project_id: string;
  name: string;
  multiplier: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

export async function getEventMultipliers(projectId: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false as const, message: "권한이 없습니다", data: [] };

  const db = createAdminClient();
  const { data, error } = await db
    .from("event_multiplier")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return { ok: false as const, message: "조회에 실패했습니다", data: [] };
  return { ok: true as const, message: null, data: (data ?? []) as EventMultiplier[] };
}

export async function createEventMultiplier(input: {
  project_id: string;
  name: string;
  multiplier: number;
  start_date?: string | null;
  end_date?: string | null;
}) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db.from("event_multiplier").insert({
    project_id: input.project_id,
    name: input.name.trim(),
    multiplier: input.multiplier,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
  });

  if (error) return { ok: false, message: "추가에 실패했습니다" };
  return { ok: true, message: null };
}

export async function updateEventMultiplier(
  id: string,
  input: {
    name?: string;
    multiplier?: number;
    is_active?: boolean;
    start_date?: string | null;
    end_date?: string | null;
  },
) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.multiplier !== undefined) updateData.multiplier = input.multiplier;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;
  if (input.start_date !== undefined) updateData.start_date = input.start_date || null;
  if (input.end_date !== undefined) updateData.end_date = input.end_date || null;

  const { error } = await db
    .from("event_multiplier")
    .update(updateData)
    .eq("id", id);

  if (error) return { ok: false, message: "수정에 실패했습니다" };
  return { ok: true, message: null };
}

export async function deleteEventMultiplier(id: string) {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다" };

  const db = createAdminClient();
  const { error } = await db.from("event_multiplier").delete().eq("id", id);

  if (error) return { ok: false, message: "삭제에 실패했습니다" };
  return { ok: true, message: null };
}

/** 활성 이벤트 배율 수 조회 (관리자 대시보드용) */
export async function getActiveEventMultiplierCount(projectId: string) {
  const db = createAdminClient();
  const { count, error } = await db
    .from("event_multiplier")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("is_active", true);

  if (error) return 0;
  return count ?? 0;
}
