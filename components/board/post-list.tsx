"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardPostSummary } from "@/lib/queries/board";
import { PostCard } from "./post-card";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

type PostListProps = {
  initialPosts: BoardPostSummary[];
  type: "notice" | "update";
};

export function PostList({ initialPosts, type }: PostListProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState<string | null>(
    initialPosts.length > 0 ? initialPosts[initialPosts.length - 1].crt_at : null,
  );
  const [hasMore, setHasMore] = useState(initialPosts.length >= 20);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPosts(initialPosts);
    setCursor(initialPosts.length > 0 ? initialPosts[initialPosts.length - 1].crt_at : null);
    setHasMore(initialPosts.length >= 20);
  }, [type]);

  useEffect(() => {
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries[0].isIntersecting || loading) return;
        setLoading(true);
        try {
          const params = new URLSearchParams({ type, limit: "20" });
          if (cursor) params.set("cursor", cursor);
          const res = await fetch(`/api/board?${params}`);
          const json = await res.json();
          const newPosts: BoardPostSummary[] = json.posts ?? [];
          if (newPosts.length < 20) setHasMore(false);
          if (newPosts.length > 0) {
            setPosts((prev) => [...prev, ...newPosts]);
            setCursor(newPosts[newPosts.length - 1].crt_at);
          }
        } finally {
          setLoading(false);
        }
      },
      { threshold: 0.1 },
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, cursor, loading, type]);

  if (posts.length === 0 && !loading) {
    return <EmptyState message="게시글이 없습니다." />;
  }

  return (
    <div>
      {posts.map((post) => (
        <PostCard key={post.post_id} post={post} />
      ))}
      {loading && (
        <div className="flex justify-center py-4">
          <LoadingSpinner />
        </div>
      )}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
