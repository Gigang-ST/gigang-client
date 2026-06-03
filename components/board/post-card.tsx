import Link from "next/link";
import { Pin } from "lucide-react";
import dayjs from "dayjs";
import type { BoardPostSummary } from "@/lib/queries/board";
import { Body, Caption } from "@/components/common/typography";

type PostCardProps = {
  post: BoardPostSummary;
};

export function PostCard({ post }: PostCardProps) {
  return (
    <Link
      href={`/board/${post.post_id}`}
      className="flex items-center justify-between gap-3 border-b border-border px-0 py-3 last:border-b-0"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {post.pin_yn && (
          <Pin className="size-3.5 shrink-0 text-primary" />
        )}
        <Body className="truncate">{post.post_nm}</Body>
      </div>
      <Caption className="shrink-0">
        {dayjs(post.crt_at).format("MM/DD")}
      </Caption>
    </Link>
  );
}
