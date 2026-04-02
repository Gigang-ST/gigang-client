import { redirect } from "next/navigation";
import { MemberOnboardingForm } from "@/components/auth/member-onboarding-form";
import { Suspense } from "react";
import { getCurrentMember } from "@/lib/queries/member";
import { env } from "@/lib/env";

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

  const { user, member } = await getCurrentMember();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(safeNext)}`);
  }

  if (member && member.status === "active") {
    redirect(safeNext === "/onboarding" ? "/" : safeNext);
  }

  const initialFullName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.user_metadata?.nickname ??
    "";

  // OAuth 프로필 사진 URL 추출 (카카오: avatar_url/picture, 구글: picture/avatar_url)
  const initialAvatarUrl =
    user.user_metadata?.picture ??
    user.user_metadata?.avatar_url ??
    null;

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <MemberOnboardingForm
          userId={user.id}
          provider={user.app_metadata?.provider as "kakao" | "google"}
          email={user.email}
          initialFullName={initialFullName}
          initialAvatarUrl={initialAvatarUrl}
          kakaoChatPassword={env.KAKAO_CHAT_PASSWORD ?? ""}
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
