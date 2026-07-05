import { Suspense } from "react";

import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { getCurrentMember } from "@/lib/queries/member";

import { MemberOnboardingForm } from "@/components/auth/member-onboarding-form";

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

  // 이미 가입된 회원(active/inactive 등)은 온보딩 불필요
  if (member) {
    redirect(safeNext === "/onboarding" ? "/" : safeNext);
  }

  // OAuth 프로필 사진 URL 추출 (카카오: avatar_url/picture, 구글: picture/avatar_url)
  const rawAvatarUrl =
    user.user_metadata?.picture ??
    user.user_metadata?.avatar_url ??
    null;
  const initialAvatarUrl = typeof rawAvatarUrl === "string" ? rawAvatarUrl : null;

  // OAuth 이름 후보 추출 — 한글 2~5자만 prefill(검증 통과 값), 그 외는 빈 값
  const rawName =
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    "";
  const initialFullName = /^[가-힣]{2,5}$/.test(rawName.trim())
    ? rawName.trim()
    : "";

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <MemberOnboardingForm
          userId={user.id}
          provider={user.app_metadata?.provider as "kakao" | "google"}
          email={user.email}
          initialAvatarUrl={initialAvatarUrl}
          initialFullName={initialFullName}
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
    <div className="flex min-h-svh w-full items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
