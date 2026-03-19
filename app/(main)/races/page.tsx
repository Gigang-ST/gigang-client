import { Skeleton } from "@/components/ui/skeleton";
import { createClient as createPublicClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { RaceListView } from "@/components/races/race-list-view";
import { validateUUID } from "@/lib/utils";
import type { Competition, CompetitionRegistration, MemberStatus } from "@/components/races/types";
import { TabLoadProbe } from "@/components/perf/tab-load-probe";

const supabase = createPublicClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

const cacheOptions = { revalidate: 86400, tags: ["competitions"] };

const getUpcomingCompetitions = unstable_cache(
  async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const endOfYear = `${now.getFullYear()}-12-31`;
    const { data } = await supabase
      .from("competition")
      .select(
        "id, external_id, sport, title, start_date, end_date, location, event_types, source_url",
      )
      .gte("start_date", today)
      .lte("start_date", endOfYear)
      .order("start_date", { ascending: true });
    return { competitions: (data ?? []) as Competition[], today };
  },
  ["competitions-upcoming"],
  cacheOptions,
);

const getGigangCompetitions = unstable_cache(
  async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const endOfYear = `${now.getFullYear()}-12-31`;
    const { data } = await supabase
      .from("competition")
      .select(
        "id, external_id, sport, title, start_date, end_date, location, event_types, source_url, competition_registration!inner(id)",
      )
      .gte("start_date", today)
      .lte("start_date", endOfYear)
      .order("start_date", { ascending: true });

    // competition_registration 필드를 제거하고 Competition 타입으로 반환
    const competitions = (data ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ competition_registration, ...rest }) => rest,
    ) as Competition[];

    // 중복 제거 (같은 대회에 여러 등록이 있으면 중복 반환됨)
    const seen = new Set<string>();
    const unique = competitions.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    return unique;
  },
  ["competitions-gigang"],
  cacheOptions,
);

async function RacesContent() {
  const serverSupabase = await createClient();
  // 목록(unstable_cache)과 인증은 병렬 — 순차 대기 시간 단축
  const [
    { competitions },
    gigangCompetitions,
    { data: { user } },
  ] = await Promise.all([
    getUpcomingCompetitions(),
    getGigangCompetitions(),
    serverSupabase.auth.getUser(),
  ]);

  let initialMemberStatus: MemberStatus = { status: "signed-out" };
  let initialRegistrationsByCompetitionId: Record<string, CompetitionRegistration> = {};
  let initialRegCounts: Record<string, number> = {};

  const allCompetitionIds = [...new Set([...competitions, ...gigangCompetitions].map((c) => c.id))];

  if (!user) {
    if (allCompetitionIds.length > 0) {
      const { data: regCountRows } = await serverSupabase
        .from("competition_registration")
        .select("competition_id")
        .in("competition_id", allCompetitionIds);
      (regCountRows ?? []).forEach((r) => {
        initialRegCounts[r.competition_id] = (initialRegCounts[r.competition_id] ?? 0) + 1;
      });
    }
  } else {
    validateUUID(user.id);
    const regCountPromise =
      allCompetitionIds.length > 0
        ? serverSupabase
            .from("competition_registration")
            .select("competition_id")
            .in("competition_id", allCompetitionIds)
        : Promise.resolve({ data: [] as { competition_id: string }[] });
    const memberPromise = serverSupabase
      .from("member")
      .select("id, full_name, email, admin")
      .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
      .maybeSingle();

    const [{ data: regCountRows }, { data: member }] = await Promise.all([
      regCountPromise,
      memberPromise,
    ]);

    (regCountRows ?? []).forEach((r) => {
      initialRegCounts[r.competition_id] = (initialRegCounts[r.competition_id] ?? 0) + 1;
    });

    if (member) {
      initialMemberStatus = {
        status: "ready",
        userId: user.id,
        memberId: member.id,
        fullName: member.full_name ?? null,
        email: member.email ?? null,
        admin: member.admin ?? false,
      };
      if (allCompetitionIds.length > 0) {
        const { data: myRegs } = await serverSupabase
          .from("competition_registration")
          .select("id, competition_id, member_id, role, event_type, created_at")
          .eq("member_id", member.id)
          .in("competition_id", allCompetitionIds);
        (myRegs ?? []).forEach((r) => {
          initialRegistrationsByCompetitionId[r.competition_id] = r as CompetitionRegistration;
        });
      }
    } else {
      initialMemberStatus = { status: "needs-onboarding", userId: user.id };
    }
  }

  return (
    <>
      <RaceListView
        allCompetitions={competitions}
        gigangCompetitions={gigangCompetitions}
        initialMemberStatus={initialMemberStatus}
        initialRegistrationsByCompetitionId={initialRegistrationsByCompetitionId}
        initialRegCounts={initialRegCounts}
      />
      <TabLoadProbe href="/races" label="대회" />
    </>
  );
}

function RacesSkeleton() {
  return (
    <>
      <div className="flex gap-0 px-6">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 flex-1 rounded-lg" />
      </div>
      <div className="flex flex-col gap-4 px-6 pt-4 pb-6">
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    </>
  );
}

export default function RacesPage() {
  return (
    <div className="flex flex-col gap-0">
      <div className="flex h-14 items-center px-6">
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground">
          대회
        </h1>
      </div>
      <Suspense fallback={<RacesSkeleton />}>
        <RacesContent />
      </Suspense>
    </div>
  );
}
