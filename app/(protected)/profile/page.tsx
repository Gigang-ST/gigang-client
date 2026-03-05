import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/auth/profile-form";
import { PersonalBestForm } from "@/components/auth/personal-best-form";
import { UtmbProfileForm } from "@/components/auth/utmb-profile-form";
import { ProfileTabs } from "@/components/auth/profile-tabs";
import { Suspense } from "react";

async function ProfileContent() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login?next=/profile");
  }

  const { data: member } = await supabase
    .from("member")
    .select(
      "id, full_name, gender, birthday, phone, email, bank_name, bank_account",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!member) {
    redirect("/onboarding?next=/profile");
  }

  const [{ data: personalBests }, { data: utmbProfile }] = await Promise.all([
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

  return (
    <div className="flex min-h-svh w-full items-center justify-center px-6 pb-6 pt-24 md:p-10 md:pt-28">
      <div className="w-full max-w-xl">
        <ProfileTabs
          profileTab={
            <ProfileForm
              userId={user.id}
              initialValues={{
                fullName: member.full_name ?? "",
                gender: (member.gender as "male" | "female" | "") ?? "",
                birthday: member.birthday ?? "",
                phone: member.phone ?? "",
                email: member.email ?? "",
                bankName: member.bank_name ?? "",
                bankAccount: member.bank_account ?? "",
              }}
            />
          }
          pbTab={
            <PersonalBestForm
              memberId={member.id}
              initialRecords={personalBests ?? []}
            />
          }
          utmbTab={
            <UtmbProfileForm
              memberId={member.id}
              initialData={utmbProfile}
            />
          }
        />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ProfileContent />
    </Suspense>
  );
}
