import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentMonthKST, nextMonthStr } from "@/lib/dayjs";

// --- Admin Stats ---

export type AdminStats = {
  pendingCount: number;
  activeCount: number;
  totalCount: number;
  monthlyCompetitionCount: number;
  recentRecordCount: number;
};

export async function getAdminStatsData(): Promise<AdminStats> {
  const admin = createAdminClient();
  const monthStart = currentMonthKST();
  const monthEnd = nextMonthStr(monthStart);

  const [pending, active, total, competitions, records] = await Promise.all([
    admin
      .from("member")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("member")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    admin.from("member").select("*", { count: "exact", head: true }),
    admin
      .from("competition")
      .select("*", { count: "exact", head: true })
      .gte("start_date", monthStart)
      .lt("start_date", monthEnd),
    admin
      .from("race_result")
      .select("*", { count: "exact", head: true }),
  ]);

  return {
    pendingCount: pending.count ?? 0,
    activeCount: active.count ?? 0,
    totalCount: total.count ?? 0,
    monthlyCompetitionCount: competitions.count ?? 0,
    recentRecordCount: records.count ?? 0,
  };
}

// --- Pending Members ---

export type PendingMember = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  joined_at: string | null;
};

export async function getPendingMembers(): Promise<PendingMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("member")
    .select("id, full_name, phone, avatar_url, joined_at")
    .eq("status", "pending")
    .order("joined_at", { ascending: false });
  return (data ?? []) as PendingMember[];
}

// --- All Members ---

export type MemberListItem = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  birthday: string | null;
  avatar_url: string | null;
  status: string | null;
  admin: boolean | null;
  joined_at: string | null;
};

export async function getAllMembers(): Promise<MemberListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("member")
    .select(
      "id, full_name, phone, email, gender, birthday, avatar_url, status, admin, joined_at",
    )
    .order("joined_at", { ascending: false });
  return (data ?? []) as MemberListItem[];
}

// --- Competitions ---

export type CompetitionListItem = {
  id: string;
  title: string;
  sport: string | null;
  start_date: string;
  end_date: string | null;
  location: string | null;
  event_types: string[] | null;
  source_url: string | null;
  registration_count: number;
};

export async function getAllCompetitions(): Promise<CompetitionListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competition")
    .select("*, competition_registration(count)")
    .order("start_date", { ascending: false });

  return (data ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    title: c.title as string,
    sport: c.sport as string | null,
    start_date: c.start_date as string,
    end_date: c.end_date as string | null,
    location: c.location as string | null,
    event_types: c.event_types as string[] | null,
    source_url: c.source_url as string | null,
    registration_count:
      (c.competition_registration as { count: number }[])?.[0]?.count ?? 0,
  }));
}

// --- Records ---

export type RaceRecordItem = {
  id: string;
  event_type: string;
  record_time_sec: number;
  race_name: string | null;
  race_date: string | null;
  member: { full_name: string | null } | null;
};

export async function getAllRecords(): Promise<RaceRecordItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("race_result")
    .select(
      "id, event_type, record_time_sec, race_name, race_date, member:member_id(full_name)",
    )
    .order("race_date", { ascending: false })
    .limit(200);
  return (data as unknown as RaceRecordItem[]) ?? [];
}
