import Link from "next/link";
import { PenLine } from "lucide-react";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getBoardPosts } from "@/lib/queries/board";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { BoardClient } from "./board-client";

export const metadata = { title: "게시판" };

export default async function BoardPage() {
  const { member } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();

  const [notices, updates] = await Promise.all([
    getBoardPosts(teamId, "notice", { limit: 20 }),
    getBoardPosts(teamId, "update", { limit: 20 }),
  ]);

  let canWrite = false;
  if (member) {
    if (member.admin) {
      canWrite = true;
    } else {
      const admin = createUntypedAdminClient();
      const { data } = await admin
        .from("team_mem_rel")
        .select("post_yn")
        .eq("team_id", teamId)
        .eq("mem_id", member.id)
        .eq("vers", 0)
        .eq("del_yn", false)
        .single();
      canWrite = (data as { post_yn?: boolean } | null)?.post_yn === true;
    }
  }

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
      />
    </div>
  );
}
