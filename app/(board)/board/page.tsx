import { DEFAULT_FALLBACK_TEAM_ID } from "@/lib/constants/gigang-team";
import { getCachedBoardPosts } from "@/lib/queries/board";
import { BackHeader } from "@/components/back-header";
import { BoardClient } from "./board-client";

export const metadata = { title: "게시판" };

// 게시판은 공개 정적 페이지(SSG). 로그인·팀 컨텍스트에 의존하지 않는다.
// 팀은 단일 팀(gigang)이라 상수로 고정 — 멀티팀이 생기면 request-team 기반으로 되살린다.
const TEAM_ID = DEFAULT_FALLBACK_TEAM_ID;

export default async function BoardPage() {
  const [notices, updates] = await Promise.all([
    getCachedBoardPosts(TEAM_ID, "notice"),
    getCachedBoardPosts(TEAM_ID, "update"),
  ]);

  return (
    <div className="flex flex-col">
      <BackHeader title="게시판" href="/" />
      <BoardClient initialNotices={notices} initialUpdates={updates} />
    </div>
  );
}
