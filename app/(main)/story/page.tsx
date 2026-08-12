import Image from "next/image";
import { Suspense } from "react";

import { getGhostMembers } from "@/lib/queries/ghost-members";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getStoryReactions, getStoryFeed } from "@/lib/queries/story-feed";
// 종이비행기 한마디(getStoryMessages) 잠정 중단(2026-07-28). MessagePlanes 존을 화면에서
// 내리면서 RPC도 함께 끊어 비용을 0으로 만든다 — 되살릴 땐 이 import와 Promise.all 항목,
// messages prop([])을 원복하고 story-client의 SHOW_MESSAGE_PLANES를 true로.
// import { getStoryMessages } from "@/lib/queries/story-messages";
import { getStoryPosts } from "@/lib/queries/story-posts";
import {
  pickActvLeadIndex,
  pickGhostSeed,
  pickRandomPostIndex,
} from "@/lib/story-post";
import { buildTitleLeadPool, pickTitleLedeStart } from "@/lib/story-title";
import { getTeamOverview } from "@/lib/queries/team-overview";
import { getRecentTitleGrants } from "@/lib/queries/story-titles";

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
  // 현상수배 정렬 시드 — 진입마다 다른 얼굴 조합이 앞에 서게 한다(대상이 30명 상한보다
  // 많아 순서가 곧 "누가 뜨느냐"다). 조회 인자라 Promise.all보다 먼저 뽑는다.
  const ghostSeed = pickGhostSeed();
  const [feed, overview, ghosts, posts, grants, { member }] = await Promise.all([
    getStoryFeed(teamId),
    getTeamOverview(teamId),
    getGhostMembers(teamId, ghostSeed),
    getStoryPosts(teamId),
    getRecentTitleGrants(teamId),
    // getStoryMessages(teamId), — 종이비행기 잠정 중단(위 import 주석 참조)
    getCurrentMember(),
  ]);

  // 응원 카운트(모두의 총합 + 내 몫)는 캐시된 피드(최대 5분 지연)에서 떼어내 매 요청 최신으로
  // 읽는다 — 남이 누른 것도 실시간에 가깝게 쌓여 보이고, 새로고침해도 내 몫이 유지된다.
  const reactions = await getStoryReactions(teamId, member?.id ?? null);

  // 리드 랜덤 슬롯들의 **진입 인덱스를 서버가 뽑아** 넘긴다. 클라에서 마운트 후 Math.random으로
  // 굴리면 "최신이 잠깐 보였다 랜덤으로 휙" 바뀌는 깜빡임이 생기고(첫 렌더=0, effect가 그 뒤
  // 랜덤), 렌더 중에 굴리면 하이드레이션이 깨진다. 서버가 정해 넘기면 서버·클라 첫 렌더가 같아
  // 깜빡임 없이 첫 화면부터 랜덤이다. 이후 굴리는 건 클라가 한 바퀴 완주할 때만.
  // 슬롯마다 pool 크기가 달라 시드 하나로 파생하면 작은 pool에서 편향되므로 개별로 뽑는다.
  // 클라(buildLedes)가 다시 % / clamp로 방어하므로 서버가 넉넉히 뽑아도 안전하다.
  // Math.random은 렌더 순수성 룰에 걸려 헬퍼로 빼 둔다.
  const initialPostPick = pickRandomPostIndex(posts.length);
  const initialNewbiePick = pickRandomPostIndex(feed.newbies.length);
  // 목표 한마디 리드 슬롯 잠정 중단(story-lede의 SHOW_PLEDGE_LEDE=false) — 서버 랜덤을
  // 돌릴 이유가 없어 0으로 넘긴다. 되살릴 땐 pickRandomPostIndex(feed.pledges.length)로 원복.
  const initialPledgePick = 0;
  const initialRecordPick = pickRandomPostIndex(feed.records.length);
  const initialActvPick = pickActvLeadIndex(feed.actv_rank.length);
  // 칭호획득 슬롯의 대표 회전 시작 오프셋 — 방문마다 다른 사람에서 시작한다(첫 화면 다양성).
  // 기준은 칭호 수가 아니라 **사람 pool 길이**(사람별 최신 1건 dedupe — §lib/story-title.ts).
  // 이후 전진은 클라가 한 바퀴 완주마다 +1 — 랜덤이 아니라 회전이라 전원이 빠짐없이 오른다.
  const initialTitlePick = pickTitleLedeStart(buildTitleLeadPool(grants).length);

  return (
    <StoryClient
      feed={feed}
      overview={overview}
      ghosts={ghosts}
      posts={posts}
      initialPostPick={initialPostPick}
      initialNewbiePick={initialNewbiePick}
      initialPledgePick={initialPledgePick}
      initialRecordPick={initialRecordPick}
      initialActvPick={initialActvPick}
      grants={grants}
      initialTitlePick={initialTitlePick}
      // 종이비행기 잠정 중단 — 쿼리를 끊었으니 항상 빈 목록. 되살릴 땐 위 Promise.all에
      // getStoryMessages를 되살리고 messages={messages}로 원복(파일 상단 import 주석 참조).
      messages={[]}
      teamId={teamId}
      myMemId={member?.id ?? null}
      // 기록 삭제 권한 — 관리자는 남의 기록도 지울 수 있다(작성자 판정은 myMemId가 한다).
      // 서버가 최종 방어하므로(§deleteRecordFlex) 이건 버튼을 보일지 정하는 안내값이다.
      isAdmin={member?.admin ?? false}
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
