import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/auth/profile-form";
import { PersonalBestForm } from "@/components/auth/personal-best-form";
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

  const { data: personalBests } = await supabase
    .from("personal_best")
    .select("event_type, record_time_sec, utmb_index, utmb_profile_url, race_name, race_date")
    .eq("member_id", member.id);

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
