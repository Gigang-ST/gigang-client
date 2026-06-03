"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutList, Pin } from "lucide-react";
import dayjs from "dayjs";
import { markBoardTypeRead } from "@/app/actions/mark-board-type-read";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentControl } from "@/components/common/segment-control";
import { Caption, Body } from "@/components/common/typography";
import { Separator } from "@/components/ui/separator";

type PopoverPost = {
  post_id: string;
  post_nm: string;
  pin_yn: boolean;
  crt_at: string;
};

type BoardPopoverIconProps = {
  hasUnreadNotice: boolean;
  hasUnreadUpdate: boolean;
  memberId?: string;
  teamId: string;
};

export function BoardPopoverIcon({
  hasUnreadNotice: initialHasUnreadNotice,
  hasUnreadUpdate: initialHasUnreadUpdate,
}: BoardPopoverIconProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"notice" | "update">("notice");
  const [hasUnreadNotice, setHasUnreadNotice] = useState(initialHasUnreadNotice);
  const [hasUnreadUpdate, setHasUnreadUpdate] = useState(initialHasUnreadUpdate);
  const [posts, setPosts] = useState<PopoverPost[]>([]);
  const [loading, setLoading] = useState(false);

  const hasAnyUnread = hasUnreadNotice || hasUnreadUpdate;

  async function fetchPosts(type: "notice" | "update") {
    setLoading(true);
    try {
      const res = await fetch(`/api/board?type=${type}&limit=5`);
      const json = await res.json();
      setPosts(json.posts ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    fetchPosts(tab);
    // 팝오버 열릴 때 현재 탭 dot 제거 + DB 읽음 처리 (목록을 눈으로 봤으면 인지한 것으로 간주)
    if (tab === "notice" && hasUnreadNotice) {
      setHasUnreadNotice(false);
      markBoardTypeRead("notice");
    } else if (tab === "update" && hasUnreadUpdate) {
      setHasUnreadUpdate(false);
      markBoardTypeRead("update");
    }
  }, [open, tab]);

  function handleTabChange(value: "notice" | "update") {
    setTab(value);
    // 탭 전환 시 dot 제거 + DB 읽음 처리
    if (value === "notice" && hasUnreadNotice) {
      setHasUnreadNotice(false);
      markBoardTypeRead("notice");
    } else if (value === "update" && hasUnreadUpdate) {
      setHasUnreadUpdate(false);
      markBoardTypeRead("update");
    }
  }

  function handlePostClick(postId: string) {
    setOpen(false);
    router.push(`/board/${postId}`);
  }

  function handleViewAll() {
    setOpen(false);
    router.push("/board");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex size-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="게시판"
        >
          <LayoutList className="size-5" />
          {hasAnyUnread && (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-3">
          <SegmentControl
            segments={[
              {
                value: "notice",
                label: hasUnreadNotice ? "공지사항 •" : "공지사항",
              },
              {
                value: "update",
                label: hasUnreadUpdate ? "업데이트 •" : "업데이트",
              },
            ]}
            value={tab}
            onValueChange={handleTabChange}
          />
        </div>

        <Separator />

        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <span className="text-xs text-muted-foreground">로딩 중...</span>
            </div>
          ) : posts.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Caption>게시글이 없습니다.</Caption>
            </div>
          ) : (
            posts.map((post) => (
              <button
                key={post.post_id}
                type="button"
                onClick={() => handlePostClick(post.post_id)}
                className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-secondary"
              >
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  {post.pin_yn && <Pin className="size-3 shrink-0 text-primary" />}
                  <Body className="truncate text-[13px]">{post.post_nm}</Body>
                </div>
                <Caption className="shrink-0 text-[11px]">
                  {dayjs(post.crt_at).format("MM/DD")}
                </Caption>
              </button>
            ))
          )}
        </div>

        <Separator />

        <button
          type="button"
          onClick={handleViewAll}
          className="flex w-full items-center justify-center py-2.5 text-[13px] text-primary"
        >
          전체 보기 →
        </button>
      </PopoverContent>
    </Popover>
  );
}
