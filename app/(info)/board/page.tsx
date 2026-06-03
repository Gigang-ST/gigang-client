import Link from "next/link";
import { PenLine } from "lucide-react";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getBoardPosts } from "@/lib/queries/board";
import { BoardClient } from "./board-client";

export const metadata = { title: "게시판" };

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const initialTab = tabParam === "update" ? "update" : "notice";

  const { member } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();

  const [notices, updates] = await Promise.all([
    getBoardPosts(teamId, "notice", { limit: 20 }),
    getBoardPosts(teamId, "update", { limit: 20 }),
  ]);

  const canWrite = member?.admin ?? false;

  return (
    <div className="flex flex-col">
      {canWrite && (
        <div className="flex justify-end px-6 pt-2">
          <Link
            href="/board/write"
            className="flex items-center gap-1.5 text-sm text-primary"
          >
            <PenLine className="size-4" />
            작성
          </Link>
        </div>
      )}
      <BoardClient
        initialNotices={notices}
        initialUpdates={updates}
        canWrite={canWrite}
        initialTab={initialTab}
      />
    </div>
  );
}
