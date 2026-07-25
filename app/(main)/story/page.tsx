import Image from "next/image";
import { Suspense } from "react";

import { getGhostMembers } from "@/lib/queries/ghost-members";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getStoryReactions, getStoryFeed } from "@/lib/queries/story-feed";
import { getStoryMessages } from "@/lib/queries/story-messages";
import { getStoryPosts } from "@/lib/queries/story-posts";
import { getTeamOverview } from "@/lib/queries/team-overview";

import { HeaderActions } from "@/components/common/header-actions";
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
  const [feed, overview, ghosts, posts, messages, { member }] = await Promise.all([
    getStoryFeed(teamId),
    getTeamOverview(teamId),
    getGhostMembers(teamId),
    getStoryPosts(teamId),
    getStoryMessages(teamId),
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
      posts={posts}
      messages={messages}
      teamId={teamId}
      myMemId={member?.id ?? null}
      me={
        member
          ? { id: member.id, name: member.full_name, avatarUrl: member.avatar_url }
          : null
      }
      reactions={reactions}
      // 제호 우상단 [알림][햄버거] — 서버에서 그려 클라이언트로 넘긴다(HeaderActions는
      // async 서버 컴포넌트라 client인 StoryClient 안에서 직접 렌더할 수 없다).
      mastheadActions={<HeaderActions />}
    />
  );
}

/**
 * 지면 로딩 — 제호는 데이터 없이도 그릴 수 있으니 형태만 잡고, 그 아래에
 * 메인 로고를 은은히 깜빡여 "불러오는 중"임을 브랜드로 알린다(무색 스켈레톤 대신).
 * 로고는 라이트/다크 공통으로 보이게 `dark:invert`(로그인 화면과 같은 규칙).
 */
function StorySkeleton() {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-2.5 px-6 pb-3 pt-2">
        <Skeleton className="h-7 w-40 rounded" />
        <Skeleton className="h-2.5 w-56 rounded" />
        <div className="rule-masthead mt-1 w-full" />
      </div>
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6">
        <Image
          src="/logo.webp"
          alt="기강"
          width={512}
          height={512}
          priority
          // 화면에 꽉 차게 키우되 회색으로 옅게 — grayscale로 색을 빼고 낮은 투명도로
          // "불러오는 중"임을 은은히 알린다(무색 스켈레톤 대신 브랜드 워터마크).
          className="h-auto w-full max-w-xs animate-pulse opacity-10 grayscale dark:opacity-[0.08] dark:invert"
        />
      </div>
    </div>
  );
}
