import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { SignupProgress } from "@/components/auth/signup-progress";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCopy } from "@/lib/queries/team-copy";
import { teamLogoFor } from "@/lib/team-logo";
import { getTeamChannels } from "@/lib/team-social";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // 하단 채널 아이콘·로고는 이 팀 것 — 이 지면은 서버가 팀을 읽고 그리므로 로고를 여기서 골라 넘긴다(미리 받기가 걸린다)
  const { teamId, teamCd } = await getRequestTeamContext();
  const [channels, copy] = await Promise.all([getTeamChannels(teamId), getTeamCopy()]);
  const teamLogo = teamLogoFor(teamCd);
  // 그림 설명은 팀 설정의 크루 이름 — 로고 표에 이름을 박지 않는다(크루 이름을 바꾸면 따라오게)
  const logo = teamLogo ? { src: teamLogo.logo, alt: copy.crewName } : null;
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
        <LoginForm channels={channels} logo={logo} />
      </Suspense>
    </>
  );
}
