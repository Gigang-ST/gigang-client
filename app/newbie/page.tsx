import type { Metadata } from "next";
import { Suspense } from "react";

import { SignupProgress } from "@/components/auth/signup-progress";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCopy, getTeamPageDescription } from "@/lib/queries/team-copy";

import { NewbieContent } from "./newbie-content";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "신입 가입 안내",
    // 검색 설명은 팀 기준(§lib/team-copy pageDescription) — 기강은 다듬어 둔 문장 그대로, 다른 팀은 크루 이름으로 만든 중립 문장
    description: await getTeamPageDescription("newbie"),
    alternates: { canonical: "/newbie" },
  };
}

/** 기강 운영 안내(정기 러닝·회칙·등급표)를 가진 팀 — 다른 팀은 공통 부분만(#658) */
const CREW_GUIDE_TEAMS: ReadonlySet<string> = new Set(["gigang"]);

export default function NewbiePage() {
  // 팀 문구는 요청 주소를 읽으므로 Suspense 안에서만 부른다(AGENTS.md). 기다리는 동안 진행바만 먼저 선다
  return (
    <Suspense fallback={<SignupProgress step={1} />}>
      <NewbieTeamContent />
    </Suspense>
  );
}

async function NewbieTeamContent() {
  const [{ teamCd }, copy] = await Promise.all([getRequestTeamContext(), getTeamCopy()]);
  return <NewbieContent crewName={copy.crewName} crewGuide={CREW_GUIDE_TEAMS.has(teamCd)} />;
}
