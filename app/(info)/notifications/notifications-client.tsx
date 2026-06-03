"use client";

import { useRef, useState } from "react";
import { Bell, Trash2 } from "lucide-react";
import type { Notification } from "@/lib/queries/notification";
import { markAllNotificationsRead } from "@/app/actions/mark-all-notifications-read";
import { deleteAllNotifications } from "@/app/actions/delete-all-notifications";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Caption, SectionLabel } from "@/components/common/typography";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useEffect } from "react";

type Props = {
  initialNotifications: Notification[];
  memberId: string;
};

export function NotificationsClient({ initialNotifications, memberId }: Props) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [cursor, setCursor] = useState<string | null>(
    initialNotifications.length > 0 ? initialNotifications[initialNotifications.length - 1].crt_at : null,
  );
  const [hasMore, setHasMore] = useState(initialNotifications.length >= 20);
  const [loading, setLoading] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries[0].isIntersecting || loading) return;
        setLoading(true);
        try {
          const params = new URLSearchParams({ limit: "20" });
          if (cursor) params.set("cursor", cursor);
          const res = await fetch(`/api/notifications?${params}`);
          const json = await res.json();
          const newItems: Notification[] = json.notifications ?? [];
          if (newItems.length < 20) setHasMore(false);
          if (newItems.length > 0) {
            setNotifications((prev) => [...prev, ...newItems]);
            setCursor(newItems[newItems.length - 1].crt_at);
          }
        } finally {
          setLoading(false);
        }
      },
      { threshold: 0.1 },
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, cursor, loading]);

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_yn: true })));
    await markAllNotificationsRead();
  }

  async function handleDeleteAll() {
    setNotifications([]);
    setDeleteAllOpen(false);
    await deleteAllNotifications();
  }

  function handleDeleteItem(notiId: string) {
    setNotifications((prev) => prev.filter((n) => n.noti_id !== notiId));
  }

  const today = new Date().toDateString();
  const todayNotis = notifications.filter((n) => new Date(n.crt_at).toDateString() === today);
  const prevNotis = notifications.filter((n) => new Date(n.crt_at).toDateString() !== today);

  return (
    <div className="flex flex-col">
      {notifications.length > 0 && (
        <div className="flex items-center justify-end gap-3 px-6 py-3">
          <button type="button" onClick={handleMarkAllRead} className="text-xs text-primary">
            모두 읽음
          </button>
          <button
            type="button"
            onClick={() => setDeleteAllOpen(true)}
            className="text-muted-foreground"
            aria-label="전체 삭제"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}

      {notifications.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20">
          <Bell className="size-12 text-muted-foreground/30" />
          <Caption>아직 알림이 없어요</Caption>
        </div>
      ) : (
        <>
          {todayNotis.length > 0 && (
            <>
              <div className="px-6 py-2">
                <SectionLabel>오늘</SectionLabel>
              </div>
              {todayNotis.map((n) => (
                <NotificationItem
                  key={n.noti_id}
                  noti={n}
                  onDelete={handleDeleteItem}
                  onRead={() => {}}
                  onClose={() => {}}
                />
              ))}
            </>
          )}
          {prevNotis.length > 0 && (
            <>
              <div className="px-6 py-2">
                <SectionLabel>이전</SectionLabel>
              </div>
              {prevNotis.map((n) => (
                <NotificationItem
                  key={n.noti_id}
                  noti={n}
                  onDelete={handleDeleteItem}
                  onRead={() => {}}
                  onClose={() => {}}
                />
              ))}
            </>
          )}
          {loading && (
            <div className="flex justify-center py-4">
              <LoadingSpinner />
            </div>
          )}
          <div ref={sentinelRef} className="h-1" />
        </>
      )}

      <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>모든 알림 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            모든 알림을 삭제할까요? 삭제 후 복구할 수 없습니다.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDeleteAll}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
