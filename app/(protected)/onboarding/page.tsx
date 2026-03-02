import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MemberOnboardingForm } from "@/components/member-onboarding-form";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login");
  }

  const { data: member } = await supabase
    .from("member")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (member) {
    redirect("/protected");
  }

  const initialFullName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.user_metadata?.nickname ??
    "";

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <MemberOnboardingForm
          userId={user.id}
          email={user.email}
          initialFullName={initialFullName}
        />
      </div>
    </div>
  );
}
