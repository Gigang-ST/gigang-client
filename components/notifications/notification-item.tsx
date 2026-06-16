"use client";

import { useState, useRef, useEffect } from "react";

import { useRouter } from "next/navigation";

import { Bell, Coins, MessageCircle, Trophy, Trash2, ChevronRight, FileText } from "lucide-react";

import { dayjs } from "@/lib/dayjs";
import type { Notification } from "@/lib/queries/notification";
import { cn } from "@/lib/utils";

import { deleteNotification } from "@/app/actions/delete-notification";
import { markNotificationRead } from "@/app/actions/mark-notification-read";

import { Body, Caption } from "@/components/common/typography";


const NOTI_ICON: Record<string, React.ElementType> = {
  ttl_grnt: Trophy,
  adm_cust: Bell,
  dues_notice: Coins,
  dues_check_req: Coins,
  cmnt_mention: MessageCircle,
  cmnt_reply: MessageCircle,
  sch_post_cmnt: MessageCircle,
  sch_post_new: FileText,
};

const NOTI_ROUTE: Record<string, (refId: string | null, refType: string | null) => string | null> = {
  ttl_grnt: () => "/profile",
  adm_cust: () => null,
  dues_notice: () => "/profile/dues",
  dues_check_req: () => null,
  sch_post_cmnt: (refId) => refId ? `/?post=${refId}` : "/",
  sch_post_new: (refId) => refId ? `/?post=${refId}` : "/",
  cmnt_mention: (refId, refType) => refType === "comp" ? `/?comp=${refId}` : refId ? `/?post=${refId}` : "/",
  cmnt_reply: (refId, refType) => refType === "comp" ? `/?comp=${refId}` : refId ? `/?post=${refId}` : "/",
};

function formatRelative(crtAt: string) {
  const diff = dayjs().diff(dayjs(crtAt), "minute");
  if (diff < 1) return "방금 전";
  if (diff < 60) return `${diff}분 전`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return dayjs(crtAt).format("MM.DD");
}

type NotificationItemProps = {
  noti: Notification;
  onDelete: (notiId: string) => void;
  onRead: (notiId: string) => void;
  onClose: () => void;
};

export function NotificationItem({ noti, onDelete, onRead, onClose }: NotificationItemProps) {
  const router = useRouter();
  const [isRead, setIsRead] = useState(noti.read_yn);
  const [swipeX, setSwipeX] = useState(0);
  const touchStartX = useRef<number | null>(null);

  // 부모에서 read_yn이 바뀌면(모두 읽음 등) 동기화
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsRead(noti.read_yn);
  }, [noti.read_yn]);

  const Icon = NOTI_ICON[noti.noti_type_enm] ?? Bell;
  const route = NOTI_ROUTE[noti.noti_type_enm]?.(noti.ref_id, noti.ref_type_enm) ?? null;

  async function handleRead() {
    if (!isRead) {
      setIsRead(true);
      onRead(noti.noti_id);
      await markNotificationRead(noti.noti_id);
    }
  }

  async function handleNavigate() {
    if (!route) return;
    await handleRead();
    onClose();
    router.push(route);
  }

  async function handleDelete() {
    onDelete(noti.noti_id);
    await deleteNotification(noti.noti_id);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (dx < 0) {
      setSwipeX(Math.max(dx, -72));
    }
  }

  function onTouchEnd() {
    if (swipeX < -40) {
      setSwipeX(-72);
    } else {
      setSwipeX(0);
    }
    touchStartX.current = null;
  }

  return (
    <div className="relative overflow-hidden">
      {/* 삭제 버튼 */}
      <button
        type="button"
        onClick={handleDelete}
        className="absolute right-0 top-0 flex h-full w-[72px] items-center justify-center bg-destructive text-destructive-foreground"
        aria-label="삭제"
      >
        <Trash2 className="size-5" />
      </button>

      {/* 알림 본문 */}
      <div
        className="relative flex items-center gap-3 bg-background px-4 py-3 transition-transform"
        style={{ transform: `translateX(${swipeX}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* 미읽음 dot */}
        <div className="flex w-3 shrink-0 items-center justify-center">
          {!isRead && <span className="size-2 rounded-full bg-destructive" />}
        </div>

        {/* 아이콘 */}
        <Icon className={cn("size-5 shrink-0", isRead ? "text-muted-foreground" : "text-foreground")} />

        {/* 내용 */}
        <button
          type="button"
          onClick={handleRead}
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
        >
          <Body className={cn("text-[13px] leading-snug", isRead && "text-muted-foreground")}>
            {noti.noti_nm}
          </Body>
          {noti.noti_cont && (
            <Caption className="line-clamp-1">{noti.noti_cont}</Caption>
          )}
          <Caption className="text-[11px]">{formatRelative(noti.crt_at)}</Caption>
        </button>

        {/* 이동 버튼 */}
        {route && (
          <button
            type="button"
            onClick={handleNavigate}
            className="shrink-0 text-muted-foreground"
            aria-label="이동"
          >
            <ChevronRight className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
