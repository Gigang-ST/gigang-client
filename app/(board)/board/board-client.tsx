"use client";

import { useSearchParams, useRouter } from "next/navigation";
import type { BoardPostSummary } from "@/lib/queries/board";
import { PostList } from "@/components/board/post-list";
import { SegmentControl } from "@/components/common/segment-control";

type BoardClientProps = {
  initialNotices: BoardPostSummary[];
  initialUpdates: BoardPostSummary[];
  canWrite: boolean;
};

export function BoardClient({ initialNotices, initialUpdates }: BoardClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = (searchParams.get("tab") === "update" ? "update" : "notice") as "notice" | "update";

  function handleTabChange(value: "notice" | "update") {
    router.replace(`/board?tab=${value}`);
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 pt-4">
      <SegmentControl
        segments={[
          { value: "notice", label: "공지사항" },
          { value: "update", label: "업데이트" },
        ]}
        value={tab}
        onValueChange={handleTabChange}
      />

      {tab === "notice" && <PostList initialPosts={initialNotices} type="notice" />}
      {tab === "update" && <PostList initialPosts={initialUpdates} type="update" />}
    </div>
  );
}
