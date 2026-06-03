"use client";

import { useState } from "react";
import Link from "next/link";
import { PenLine } from "lucide-react";
import type { BoardPostSummary } from "@/lib/queries/board";
import { PostList } from "@/components/board/post-list";
import { SegmentControl } from "@/components/common/segment-control";
import { Button } from "@/components/ui/button";

type BoardClientProps = {
  initialNotices: BoardPostSummary[];
  initialUpdates: BoardPostSummary[];
  canWrite: boolean;
};

export function BoardClient({ initialNotices, initialUpdates, canWrite }: BoardClientProps) {
  const [tab, setTab] = useState<"notice" | "update">("notice");

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 pt-4">
      <SegmentControl
        segments={[
          { value: "notice", label: "공지사항" },
          { value: "update", label: "업데이트" },
        ]}
        value={tab}
        onValueChange={setTab}
      />

      {tab === "notice" && <PostList initialPosts={initialNotices} type="notice" />}
      {tab === "update" && <PostList initialPosts={initialUpdates} type="update" />}
    </div>
  );
}
