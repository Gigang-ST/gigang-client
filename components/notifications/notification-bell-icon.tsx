"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Settings, Trash2, ChevronLeft } from "lucide-react";
import { dayjs } from "@/lib/dayjs";
import { createClient } from "@/lib/supabase/client";
import type { Notification, NotificationPref } from "@/lib/queries/notification";
import { markAllNotificationsRead } from "@/app/actions/mark-all-notifications-read";
import { deleteAllNotifications } from "@/app/actions/delete-all-notifications";
import { upsertNotiPref } from "@/app/actions/upsert-noti-pref";
import { NotificationItem } from "./notification-item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Body, Caption, SectionLabel } from "@/components/common/typography";

type NotificationBellIconProps = {
  initialCount: number;
  memberId?: string;
  disabled?: boolean;
};

const NOTI_TYPE_LABELS: Record<string, string> = {
  ttl_grnt: "칭호 획득",
};

type ViewType = "list" | "settings";

export function NotificationBellIcon({ initialCount, memberId, disabled }: NotificationBellIconProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewType>("list");
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [prefs, setPrefs] = useState<NotificationPref[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realtimeRef = useRef<any>(null);

  async function fetchNotifications(replace = false, cur?: string | null) {
    if (!memberId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "20" });
      const useCursor = cur !== undefined ? cur : cursor;
      if (useCursor) params.set("cursor", useCursor);
      const res = await fetch(`/api/notifications?${params}`);
      const json = await res.json();
      const newItems: Notification[] = json.notifications ?? [];
      if (newItems.length < 20) setHasMore(false);
      if (replace) {
        setNotifications(newItems);
      } else {
        setNotifications((prev) => [...prev, ...newItems]);
      }
      if (newItems.length > 0) setCursor(newItems[newItems.length - 1].crt_at);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPrefs() {
    if (!memberId) return;
    const res = await fetch("/api/notifications/prefs");
    const json = await res.json();
    setPrefs(json.prefs ?? []);
  }

  useEffect(() => {
    if (!open || !memberId) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMore(true);
    fetchNotifications(true, null);

    const supabase = createClient();
    const channel = supabase
      .channel(`noti_mst_${memberId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "noti_mst",
        filter: `mem_id=eq.${memberId}`,
      }, (payload) => {
        const noti = payload.new as Notification;
        setNotifications((prev) => [noti, ...prev]);
        setUnreadCount((c) => c + 1);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "noti_mst",
        filter: `mem_id=eq.${memberId}`,
      }, (payload) => {
        const updated = payload.new as Notification;
        setNotifications((prev) =>
          prev.map((n) => n.noti_id === updated.noti_id ? { ...n, ...updated } : n)
        );
      })
      .subscribe();

    realtimeRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      realtimeRef.current = null;
    };
  }, [open, memberId]);

  // 팝오버 내부 스크롤 무한스크롤
  useEffect(() => {
    if (!hasMore || loading || !open) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) fetchNotifications(); },
      { threshold: 0.1 },
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, open, cursor]);

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_yn: true })));
    setUnreadCount(0);
    await markAllNotificationsRead();
  }

  async function handleDeleteAll() {
    setNotifications([]);
    setUnreadCount(0);
    setDeleteAllOpen(false);
    await deleteAllNotifications();
  }

  function handleReadItem(notiId: string) {
    setUnreadCount((c) => Math.max(0, c - 1));
    setNotifications((prev) =>
      prev.map((n) => n.noti_id === notiId ? { ...n, read_yn: true } : n),
    );
  }

  function handleDeleteItem(notiId: string) {
    setNotifications((prev) => {
      const item = prev.find((n) => n.noti_id === notiId);
      if (item && !item.read_yn) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.filter((n) => n.noti_id !== notiId);
    });
  }

  async function handlePrefToggle(type: string, enabled: boolean) {
    setPrefs((prev) => {
      const exists = prev.find((p) => p.noti_type_enm === type);
      if (exists) return prev.map((p) => p.noti_type_enm === type ? { ...p, enabled_yn: enabled } : p);
      return [...prev, { noti_type_enm: type, enabled_yn: enabled }];
    });
    await upsertNotiPref(type, enabled);
  }

  function getPrefEnabled(type: string) {
    return prefs.find((p) => p.noti_type_enm === type)?.enabled_yn ?? true;
  }

  const today = dayjs().format("YYYY-MM-DD");
  const todayNotis = notifications.filter((n) => dayjs(n.crt_at).format("YYYY-MM-DD") === today);
  const prevNotis = notifications.filter((n) => dayjs(n.crt_at).format("YYYY-MM-DD") !== today);

  if (disabled) {
    return (
      <button disabled className="flex size-8 items-center justify-center rounded-md text-muted-foreground/40" aria-label="알림 (비활성)">
        <Bell className="size-5" />
      </button>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setView("list"); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="relative flex size-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="알림"
          >
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-80 p-0">
          {/* 헤더 */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            {view === "settings" ? (
              <button type="button" onClick={() => setView("list")} className="flex items-center gap-1 text-sm font-medium">
                <ChevronLeft className="size-4" />
                알림 설정
              </button>
            ) : (
              <Body className="text-[14px] font-semibold">알림</Body>
            )}
            {view === "list" && (
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <>
                    <button type="button" onClick={handleMarkAllRead} className="text-xs text-primary">
                      모두 읽음
                    </button>
                    <button type="button" onClick={() => setDeleteAllOpen(true)} className="text-muted-foreground" aria-label="전체 삭제">
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
                <button type="button" onClick={() => { setView("settings"); fetchPrefs(); }} className="text-muted-foreground" aria-label="알림 설정">
                  <Settings className="size-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 본문 */}
          <div className="max-h-96 overflow-y-auto">
            {view === "list" && (
              <>
                {notifications.length === 0 && !loading ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10">
                    <Bell className="size-8 text-muted-foreground/30" />
                    <Caption>아직 알림이 없어요</Caption>
                  </div>
                ) : (
                  <>
                    {todayNotis.length > 0 && (
                      <>
                        <div className="px-4 py-2"><SectionLabel>오늘</SectionLabel></div>
                        {todayNotis.map((n) => (
                          <NotificationItem key={n.noti_id} noti={n} onDelete={handleDeleteItem} onRead={handleReadItem} onClose={() => setOpen(false)} />
                        ))}
                      </>
                    )}
                    {prevNotis.length > 0 && (
                      <>
                        <div className="px-4 py-2"><SectionLabel>이전</SectionLabel></div>
                        {prevNotis.map((n) => (
                          <NotificationItem key={n.noti_id} noti={n} onDelete={handleDeleteItem} onRead={handleReadItem} onClose={() => setOpen(false)} />
                        ))}
                      </>
                    )}
                    {loading && (
                      <div className="flex justify-center py-3">
                        <Caption>로딩 중...</Caption>
                      </div>
                    )}
                    <div ref={sentinelRef} className="h-1" />
                  </>
                )}
              </>
            )}

            {view === "settings" && (
              <div className="py-1">
                {Object.entries(NOTI_TYPE_LABELS).map(([type, label]) => (
                  <div key={type} className="flex items-center justify-between px-4 py-2.5">
                    <Body className="text-[13px]">{label}</Body>
                    <Switch checked={getPrefEnabled(type)} onCheckedChange={(val) => handlePrefToggle(type, val)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>모든 알림 삭제</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">모든 알림을 삭제할까요? 삭제 후 복구할 수 없습니다.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllOpen(false)}>취소</Button>
            <Button variant="destructive" onClick={handleDeleteAll}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
