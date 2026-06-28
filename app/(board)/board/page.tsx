import { DEFAULT_FALLBACK_TEAM_ID } from "@/lib/constants/gigang-team";
import { getCachedBoardPosts } from "@/lib/queries/board";
import { BackHeader } from "@/components/back-header";
import { BoardClient } from "./board-client";

export const metadata = { title: "게시판" };

export default async function BoardPage() {
  const teamId = DEFAULT_FALLBACK_TEAM_ID;

  const [notices, updates] = await Promise.all([
    getCachedBoardPosts(teamId, "notice"),
    getCachedBoardPosts(teamId, "update"),
  ]);

  return (
    <div className="flex flex-col">
      <BackHeader title="게시판" href="/" />
      <BoardClient initialNotices={notices} initialUpdates={updates} />
    </div>
  );
}
