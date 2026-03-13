import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";
import { Suspense } from "react";
import Link from "next/link";
import { Settings, User } from "lucide-react";
import { PersonalBestGrid } from "@/components/profile/personal-best-grid";
import { UtmbIndexSection } from "@/components/profile/utmb-index-section";

async function ProfileContent() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login?next=/profile");
  }

  validateUUID(user.id);
  const { data: member } = await supabase
    .from("member")
    .select(
      "id, full_name, gender, birthday, phone, email, bank_name, bank_account, joined_at",
    )
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();

  if (!member) {
    redirect("/onboarding?next=/profile");
  }

  const [{ data: personalBests }, { data: utmbProfile }] =
    await Promise.all([
      supabase
        .from("personal_best")
        .select("event_type, record_time_sec, race_name, race_date")
        .eq("member_id", member.id),
      supabase
        .from("utmb_profile")
        .select("utmb_profile_url, utmb_index")
        .eq("member_id", member.id)
        .maybeSingle(),
    ]);

  const genderLabel = member.gender === "male" ? "남성" : member.gender === "female" ? "여성" : "";
  const joinedDate = member.joined_at
    ? new Date(member.joined_at).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit" }).replace(". ", ".").replace(".", "")
    : "";

  return (
    <div className="flex flex-col gap-6 px-6 pb-6">
        {/* Profile Card */}
        <div className="flex items-center gap-4 rounded-2xl border-[1.5px] border-border p-5">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <User className="size-7 text-primary" />
          </div>
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
        </div>

        {/* Personal Best */}
        <PersonalBestGrid
          memberId={member.id}
          initialRecords={personalBests ?? []}
        />

        {/* UTMB Index */}
        <UtmbIndexSection
          memberId={member.id}
          initialData={utmbProfile ?? null}
        />
      </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-6 pb-6">
      {/* Profile Card */}
      <div className="flex items-center gap-4 rounded-2xl border-[1.5px] border-border p-5">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-8 w-12 rounded-lg" />
      </div>
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
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground">
          내 프로필
        </h1>
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
