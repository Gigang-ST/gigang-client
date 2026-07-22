import { Suspense } from "react";

import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getStoryFeed } from "@/lib/queries/story-feed";

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
  const [feed, { member }] = await Promise.all([
    getStoryFeed(teamId),
    getCurrentMember(),
  ]);

  return (
    <StoryClient feed={feed} teamId={teamId} myMemId={member?.id ?? null} />
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
