import type { Metadata } from "next";
import { Suspense } from "react";

import { SignupProgress } from "@/components/auth/signup-progress";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCopy, getTeamPageDescription } from "@/lib/queries/team-copy";
import { getTeamSignup } from "@/lib/team-signup";

import { NewbieContent } from "./newbie-content";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "신입 가입 안내",
    // 검색 설명은 팀 기준(§lib/team-copy pageDescription) — 기강은 다듬어 둔 문장 그대로, 다른 팀은 크루 이름으로 만든 중립 문장
    description: await getTeamPageDescription("newbie"),
    alternates: { canonical: "/newbie" },
  };
}

export default function NewbiePage() {
  // 팀 문구는 요청 주소를 읽으므로 Suspense 안에서만 부른다(AGENTS.md). 기다리는 동안 진행바만 먼저 선다
  return (
    <Suspense fallback={<SignupProgress step="시작" />}>
      <NewbieTeamContent />
    </Suspense>
  );
}

async function NewbieTeamContent() {
  const [{ teamCd }, copy] = await Promise.all([getRequestTeamContext(), getTeamCopy()]);
  // 단계·기강 운영 안내 노출은 팀 가입 설정 한 곳(§lib/team-signup) — 진행바·가입 폼과 같은 표다
  return <NewbieContent crewName={copy.crewName} signup={getTeamSignup(teamCd)} />;
}
