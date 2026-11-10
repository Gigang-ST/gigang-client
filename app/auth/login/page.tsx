import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { SignupProgress } from "@/components/auth/signup-progress";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamChannels } from "@/lib/team-social";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // 하단 채널 아이콘은 이 팀 것(팀 설정)
  const { teamId } = await getRequestTeamContext();
  const channels = await getTeamChannels(teamId);
  const isSignupFlow = next === "/onboarding";
  return (
    <>
      {isSignupFlow && <SignupProgress step={2} />}
      <Suspense
        fallback={
          <div className="flex min-h-svh w-full items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        }
      >
        <LoginForm channels={channels} />
      </Suspense>
    </>
  );
}
