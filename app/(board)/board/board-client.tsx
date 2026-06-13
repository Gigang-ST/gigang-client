"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PenLine } from "lucide-react";
import type { BoardPostSummary } from "@/lib/queries/board";
import { PostList } from "@/components/board/post-list";
import { SegmentControl } from "@/components/common/segment-control";

type BoardClientProps = {
  initialNotices: BoardPostSummary[];
  initialUpdates: BoardPostSummary[];
  canWrite: boolean;
};

export function BoardClient({ initialNotices, initialUpdates, canWrite }: BoardClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = (searchParams.get("tab") === "update" ? "update" : "notice") as "notice" | "update";

  function handleTabChange(value: "notice" | "update") {
    router.replace(`/board?tab=${value}`);
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 pt-4">
      <div className="flex items-center justify-between">
        <SegmentControl
          segments={[
            { value: "notice", label: "공지사항" },
            { value: "update", label: "업데이트" },
          ]}
          value={tab}
          onValueChange={handleTabChange}
          className="flex-1"
        />
        {canWrite && (
          <Link
            href={`/board/write?type=${tab}`}
            className="ml-3 flex shrink-0 items-center gap-1 text-sm text-primary"
          >
            <PenLine className="size-4" />
            작성
          </Link>
        )}
      </div>

      {tab === "notice" && <PostList initialPosts={initialNotices} type="notice" />}
      {tab === "update" && <PostList initialPosts={initialUpdates} type="update" />}
    </div>
  );
}
