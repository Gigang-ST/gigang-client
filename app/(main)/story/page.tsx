import { Suspense } from "react";

import { getGhostMembers } from "@/lib/queries/ghost-members";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getStoryReactions, getStoryFeed } from "@/lib/queries/story-feed";
import { getTeamOverview } from "@/lib/queries/team-overview";

import { StoryClient } from "@/components/story/story-client";
import { Skeleton } from "@/components/ui/skeleton";

export default function StoryPage() {
  return (
    // 제호(masthead)가 이 페이지의 헤더 역할을 한다 — PageHeader를 쓰지 않는다.
    <div className="flex flex-col gap-0">
      <Suspense fallback={<StorySkeleton />}>
        <StoryFeedSection />
      </Suspense>
    </div>
  );
}

/**
 * 피드 본문 — 팀 공개 데이터라 비로그인도 볼 수 있다.
 * 로그인 조회(`getCurrentMember`)는 쿠키를 읽으므로 Suspense 경계 안에 가둬
 * 헤더 렌더를 막지 않게 한다(홈의 설치 배너 패턴과 동일).
 */
async function StoryFeedSection() {
  const { teamId } = await getRequestTeamContext();
  const [feed, overview, ghosts, { member }] = await Promise.all([
    getStoryFeed(teamId),
    getTeamOverview(teamId),
    getGhostMembers(teamId),
    getCurrentMember(),
  ]);

  // 응원 카운트(모두의 총합 + 내 몫)는 캐시된 피드(최대 5분 지연)에서 떼어내 매 요청 최신으로
  // 읽는다 — 남이 누른 것도 실시간에 가깝게 쌓여 보이고, 새로고침해도 내 몫이 유지된다.
  const reactions = await getStoryReactions(teamId, member?.id ?? null);

  return (
    <StoryClient
      feed={feed}
      overview={overview}
      ghosts={ghosts}
      teamId={teamId}
      myMemId={member?.id ?? null}
      reactions={reactions}
    />
  );
}

/** 지면 스켈레톤 — 제호는 데이터 없이 그릴 수 있으므로 형태만 먼저 잡아둔다 */
function StorySkeleton() {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-2.5 px-6 pb-3 pt-2">
        <Skeleton className="h-7 w-40 rounded" />
        <Skeleton className="h-2.5 w-56 rounded" />
        <div className="rule-masthead mt-1 w-full" />
      </div>
      <div className="flex flex-col gap-3 px-6 pt-4">
        <Skeleton className="h-2.5 w-20 rounded" />
        <Skeleton className="h-7 w-full rounded" />
        <Skeleton className="h-7 w-2/3 rounded" />
        <Skeleton className="h-3 w-40 rounded" />
        <Skeleton className="mt-1 size-14 rounded-full" />
      </div>
      <div className="flex flex-col gap-3 px-6 pt-10">
        <Skeleton className="h-3 w-28 rounded" />
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-10 w-full rounded" />
      </div>
    </div>
  );
}
