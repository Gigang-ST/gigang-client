import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/auth/profile-form";
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
      "full_name, gender, birthday, phone, email, bank_name, bank_account",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!member) {
    redirect("/onboarding?next=/profile");
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-xl">
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
