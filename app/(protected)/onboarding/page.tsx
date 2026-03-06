import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MemberOnboardingForm } from "@/components/auth/member-onboarding-form";
import { Suspense } from "react";

async function OnboardingContent() {
  const nextParam = "/onboarding";
  const safeNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(`/auth/login?next=${encodeURIComponent(safeNext)}`);
  }

  const { data: member } = await supabase
    .from("member")
    .select("id")
    .or(`kakao_user_id.eq.${user.id},google_user_id.eq.${user.id}`)
    .maybeSingle();

  if (member) {
    redirect(safeNext === "/onboarding" ? "/" : safeNext);
  }

  const initialFullName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.user_metadata?.nickname ??
    "";

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <MemberOnboardingForm
          userId={user.id}
          provider={user.app_metadata?.provider as "kakao" | "google"}
          email={user.email}
          initialFullName={initialFullName}
        />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}
