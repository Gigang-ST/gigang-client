"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutList, Megaphone, Zap } from "lucide-react";
import { markBoardTypeRead } from "@/app/actions/mark-board-type-read";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Body } from "@/components/common/typography";
import { Separator } from "@/components/ui/separator";

type BoardPopoverIconProps = {
  hasUnreadNotice: boolean;
  hasUnreadUpdate: boolean;
  memberId?: string;
  teamId: string;
};

export function BoardPopoverIcon({
  hasUnreadNotice: initialHasUnreadNotice,
  hasUnreadUpdate: initialHasUnreadUpdate,
  memberId,
}: BoardPopoverIconProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hasUnreadNotice, setHasUnreadNotice] = useState(initialHasUnreadNotice);
  const [hasUnreadUpdate, setHasUnreadUpdate] = useState(initialHasUnreadUpdate);

  const hasAnyUnread = hasUnreadNotice || hasUnreadUpdate;

  function handleClick(tab: "notice" | "update") {
    setOpen(false);
    // 게시판 진입 시 공지/업데이트 dot 모두 제거 + DB 읽음 처리
    // 어느 탭이든 들어가면 둘 다 확인한 것으로 간주
    if (memberId) {
      if (hasUnreadNotice) {
        setHasUnreadNotice(false);
        markBoardTypeRead("notice");
      }
      if (hasUnreadUpdate) {
        setHasUnreadUpdate(false);
        markBoardTypeRead("update");
      }
    }
    router.push(`/board?tab=${tab}`);
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
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-destructive" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-0">
        <button
          type="button"
          onClick={() => handleClick("notice")}
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-secondary"
        >
          <div className="flex items-center gap-2.5">
            <Megaphone className="size-4 text-muted-foreground" />
            <Body className="text-[14px]">공지사항</Body>
          </div>
          {hasUnreadNotice && (
            <span className="size-1.5 rounded-full bg-destructive" />
          )}
        </button>

        <Separator />

        <button
          type="button"
          onClick={() => handleClick("update")}
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-secondary"
        >
          <div className="flex items-center gap-2.5">
            <Zap className="size-4 text-muted-foreground" />
            <Body className="text-[14px]">업데이트</Body>
          </div>
          {hasUnreadUpdate && (
            <span className="size-1.5 rounded-full bg-destructive" />
          )}
        </button>
      </PopoverContent>
    </Popover>
  );
}
