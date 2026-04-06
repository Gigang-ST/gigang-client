import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { redirect } from "next/navigation";
import dayjs from "dayjs";
import { Suspense } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { Avatar } from "@/components/common/avatar";
import { PersonalBestGrid } from "@/components/profile/personal-best-grid";
import { RaceRecordSection } from "@/components/profile/race-record-section";
import { PaceChart } from "@/components/profile/pace-chart";
import { getCurrentMember } from "@/lib/queries/member";

async function ProfileContent() {
  const { user, member, supabase } = await getCurrentMember();

  if (!user) {
    redirect("/auth/login?next=/profile");
  }

  if (!member) {
    redirect("/onboarding?next=/profile");
  }

  const [{ data: raceResults }, { data: utmbProfile }] = await Promise.all([
    supabase
      .from("race_result")
      .select("event_type, record_time_sec, race_name, race_date")
      .eq("member_id", member.id)
      .in("event_type", ["FULL", "HALF", "10K"]),
    supabase
      .from("utmb_profile")
      .select("utmb_profile_url, utmb_index, recent_race_name, recent_race_record")
      .eq("member_id", member.id)
      .maybeSingle(),
  ]);

  // Build best records map: for each event_type, pick the one with lowest record_time_sec
  const bestRecords: Record<string, { record_time_sec: number; race_name: string }> = {};
  (raceResults ?? []).forEach((r) => {
    const existing = bestRecords[r.event_type];
    if (!existing || r.record_time_sec < existing.record_time_sec) {
      bestRecords[r.event_type] = { record_time_sec: r.record_time_sec, race_name: r.race_name };
    }
  });

  const genderLabel = member.gender === "male" ? "남성" : member.gender === "female" ? "여성" : "";
  const joinedDate = member.joined_at
    ? dayjs(member.joined_at).format("YYYY. M")
    : "";

  return (
    <div className="flex flex-col gap-6 px-6 pb-6">
        {/* Profile Card */}
        <CardItem className="flex items-center gap-4 p-5">
          <Avatar src={member.avatar_url} alt={member.full_name ?? ""} size="xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[17px] font-bold text-foreground">
              {member.full_name}
            </span>
            <span className="text-xs text-muted-foreground">
              {genderLabel}{joinedDate ? ` · ${joinedDate} 가입` : ""}
            </span>
          </div>
          <span className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary">
            활동
          </span>
        </CardItem>

        {/* Personal Best */}
        <PersonalBestGrid
          memberId={member.id}
          bestRecords={bestRecords}
          utmbData={utmbProfile?.utmb_profile_url && utmbProfile?.utmb_index != null ? { utmb_profile_url: utmbProfile.utmb_profile_url, utmb_index: utmbProfile.utmb_index, recent_race_name: utmbProfile.recent_race_name, recent_race_record: utmbProfile.recent_race_record } : null}
        />

        {/* 페이스 그래프 */}
        <PaceChart records={raceResults ?? []} />

        {/* 기록 입력 */}
        <RaceRecordSection memberId={member.id} />
      </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-6 pb-6">
      {/* Profile Card */}
      <CardItem className="flex items-center gap-4 p-5">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-8 w-12 rounded-lg" />
      </CardItem>
      {/* Personal Best */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
      {/* UTMB */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <div className="flex flex-col gap-0">
      <div className="flex h-14 items-center justify-between px-6">
        <H1 className="font-semibold">내 프로필</H1>
        <Link href="/settings">
          <Settings className="size-[22px] text-muted-foreground" />
        </Link>
      </div>
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}
