import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getBoardPosts } from "@/lib/queries/board";
import { BackHeader } from "@/components/back-header";
import { BoardClient } from "./board-client";

export const metadata = { title: "게시판" };

export default async function BoardPage() {
  const { member } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();

  const [notices, updates] = await Promise.all([
    getBoardPosts(teamId, "notice", { limit: 20 }),
    getBoardPosts(teamId, "update", { limit: 20 }),
  ]);

  const canWrite = member?.admin ?? false;

  return (
    <div className="flex flex-col">
      <BackHeader title="게시판" href="/" />
      <BoardClient
        initialNotices={notices}
        initialUpdates={updates}
        canWrite={canWrite}
      />
    </div>
  );
}
