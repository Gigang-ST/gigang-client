import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/utils";
import { MemberOnboardingForm } from "@/components/auth/member-onboarding-form";
import { Suspense } from "react";

async function OnboardingContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextParam = params.next ?? "/";
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

  validateUUID(user.id);
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

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingContent searchParams={searchParams} />
    </Suspense>
  );
}

function OnboardingFallback() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-white px-6">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
