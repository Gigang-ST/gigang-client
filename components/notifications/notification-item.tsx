"use client";

import { useState, useRef, useEffect } from "react";

import { useRouter } from "next/navigation";

import { Bell, Coins, MessageCircle, Trophy, Trash2, FileText, Users, MessageSquareText } from "lucide-react";

import { dayjs, formatKST } from "@/lib/dayjs";
import { resolveNotiDeepLink } from "@/lib/notifications/deep-link";
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
  gthr_new: Users,
  gthr_upd: Users,
  gthr_del: Users,
  gthr_cncl: Users,
  gthr_cmnt: MessageCircle,
  gthr_reply: MessageCircle,
  gthr_mention: MessageCircle,
  post_cmnt: MessageCircle,
  post_reply: MessageCircle,
  fdbk_new: MessageSquareText,
  fdbk_rspd: MessageSquareText,
  reactivate_req: Users,
};

function formatRelative(crtAt: string) {
  // 경과시간은 **절대시각끼리의 차이**라 타임존과 무관하다 — 여기는 그대로 둔다.
  // 아래 날짜 표시(7일 넘은 알림)만 KST로 찍어야 한다(§lib/dayjs formatKST).
  const diff = dayjs().diff(dayjs(crtAt), "minute");
  if (diff < 1) return "방금 전";
  if (diff < 60) return `${diff}분 전`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return formatKST(crtAt, "MM.DD");
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
  const route = resolveNotiDeepLink(noti.noti_type_enm, noti.ref_id, noti.ref_type_enm);

  /**
   * 목적지를 **미리 받아 둔다** — 알림은 지금 보고 있는 탭이 아니라 남의 페이지를 가리키는
   * 일이 많아, 누르는 순간 라우트 하나를 통째로 새로 여는 비용이 그대로 체감된다
   * (홈에서 운동기록 알림을 누르면 `/story`를 처음부터 세운다).
   *
   * 이 컴포넌트는 **팝오버가 열려 있을 때만** 그려지므로, 프리페치도 알림함을 연 사람에게만
   * 걸린다 — 앱 어디서나 미리 받아 두는 게 아니다.
   *
   * 쿼리(`?rec=`·`?gthr=`…)는 떼고 **경로만** 받는다: 딥링크 쿼리는 알림마다 달라 캐시가
   * 안 겹치는데, 정작 무거운 건 페이지 자체다. 경로만 받아 두면 알림 20건이 같은 `/story`
   * 하나를 공유한다(Next가 같은 경로를 중복 요청하지 않는다).
   */
  useEffect(() => {
    if (!route) return;
    router.prefetch(route.split("?")[0]);
  }, [route, router]);

  function handleRead() {
    if (!isRead) {
      setIsRead(true);
      onRead(noti.noti_id);
      markNotificationRead(noti.noti_id); // fire-and-forget: UI 블로킹 없이 백그라운드 처리
    }
  }

  function handleNavigate() {
    if (!route) return;
    handleRead();
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

      {/* 알림 본문 — 로우 전체가 클릭 영역 */}
      <button
        type="button"
        onClick={route ? handleNavigate : handleRead}
        className="relative flex w-full items-center gap-3 bg-background px-4 py-3 text-left transition-transform active:bg-muted/50"
        style={{ transform: `translateX(${swipeX}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* 아이콘 + 미읽음 dot */}
        <div className="relative flex shrink-0 items-center justify-center">
          <Icon className={cn("size-5", isRead ? "text-muted-foreground" : "text-foreground")} />
          {!isRead && (
            <span className="absolute -right-1 -top-1 size-2 rounded-full bg-destructive" />
          )}
        </div>

        {/* 내용 */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Body className={cn("text-[13px] leading-snug", isRead && "text-muted-foreground")}>
            {noti.noti_nm}
          </Body>
          {noti.noti_cont && (
            <Caption className="line-clamp-1">{noti.noti_cont}</Caption>
          )}
          <Caption className="text-[11px]">{formatRelative(noti.crt_at)}</Caption>
        </div>
      </button>
    </div>
  );
}
