import type { Metadata } from "next";
import { getTeamPageDescription } from "@/lib/queries/team-copy";
import { getCachedBoardPosts } from "@/lib/queries/board";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { BackHeader } from "@/components/back-header";
import { BoardClient } from "./board-client";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "게시판",
    // 검색 설명은 팀 기준(§lib/team-copy pageDescription) — 기강은 다듬어 둔 문장 그대로, 다른 팀은 크루 이름으로 만든 중립 문장
    description: await getTeamPageDescription("board"),
    alternates: { canonical: "/board" },
  };
}

// 게시판은 **접속한 팀**의 글만 보인다(멀티팀). 주소로 팀을 정하므로 정적 생성(SSG)이 아니라
// 요청마다 렌더된다 — 목록 데이터는 팀별 캐시(1시간)라 DB 부담은 그대로고, 늘어나는 건 게시판 방문 수만큼의
// 함수 호출뿐이다(공지·업데이트 방문은 하루 수십 건 수준이라 Vercel 무료 한도와 거리가 멀다).
// 다음 페이지(`/api/board`)도 같은 팀으로 읽는다 — 첫 페이지만 기강으로 고정이면 두 팀 글이 섞였다.
export default async function BoardPage() {
  const { teamId } = await getRequestTeamContext();
  const [notices, updates] = await Promise.all([
    getCachedBoardPosts(teamId, "notice"),
    getCachedBoardPosts(teamId, "update"),
  ]);

  return (
    <div className="flex flex-col">
      <BackHeader title="게시판" fallbackHref="/" />
      <BoardClient initialNotices={notices} initialUpdates={updates} />
    </div>
  );
}
