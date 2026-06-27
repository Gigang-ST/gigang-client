"use client";

import { useEffect, useRef, useState } from "react";

import { Bell, Settings, Trash2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { dayjs } from "@/lib/dayjs";
import {
  canUsePush,
  getPermission,
  hasSubscription,
  needsInstall,
  subscribePush,
  unsubscribePush,
} from "@/lib/push/client";
import type { Notification, NotificationPref } from "@/lib/queries/notification";
import { createClient } from "@/lib/supabase/client";

import { deleteAllNotifications } from "@/app/actions/delete-all-notifications";
import { markAllNotificationsRead } from "@/app/actions/mark-all-notifications-read";
import { upsertNotiPref } from "@/app/actions/upsert-noti-pref";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

import { NotificationItem } from "./notification-item";

type NotificationBellIconProps = {
  initialCount: number;
  initialNotifications?: Notification[];
  memberId?: string;
  disabled?: boolean;
};

// 껐다 켤 수 있는 알림만 노출. fdbk_rspd(내 건의 답변)는 항상 받아야 하는 필수 알림이라 제외.
const NOTI_TYPE_LABELS: Record<string, string> = {
  gthr_new: "새 모임 등록",
  gthr_upd: "참가 모임 수정·삭제",
  sch_post_new: "새 정보 등록",
  ttl_grnt: "칭호 획득",
};

type ViewType = "list" | "settings";

export function NotificationBellIcon({ initialCount, initialNotifications, memberId, disabled }: NotificationBellIconProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewType>("list");
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications ?? []);
  const [prefs, setPrefs] = useState<NotificationPref[]>([]);
  // 푸시: null=판단중, "on"/"off"=토글 가능, "denied"=OS 차단, "install"=iOS 설치 필요, "unsupported"=대상 아님
  const [pushState, setPushState] = useState<
    "on" | "off" | "denied" | "install" | "unsupported" | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState((initialNotifications ?? []).length === 20);
  const [cursor, setCursor] = useState<string | null>(
    initialNotifications && initialNotifications.length > 0 ? initialNotifications[initialNotifications.length - 1].crt_at : null,
  );
  // 서버에서 initialNotifications를 명시적으로 내려준 경우 이미 로딩 완료로 간주
  const notificationsLoaded = useRef(initialNotifications !== undefined);
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

  async function refreshPushState() {
    if (needsInstall()) {
      setPushState("install");
      return;
    }
    if (!canUsePush()) {
      setPushState("unsupported");
      return;
    }
    const perm = getPermission();
    if (perm === "denied") {
      setPushState("denied");
      return;
    }
    setPushState((await hasSubscription()) ? "on" : "off");
  }

  async function handlePushToggle(next: boolean) {
    if (next) {
      const result = await subscribePush();
      if (result.ok) {
        setPushState("on");
        toast.success("푸시 알림이 켜졌어요");
      } else if (result.reason === "denied") {
        setPushState("denied");
        toast("기기 설정에서 알림을 허용해 주세요");
      } else if (result.reason === "needs-install") {
        setPushState("install");
      } else {
        toast.error("푸시 알림을 켜지 못했어요");
      }
    } else {
      await unsubscribePush();
      setPushState("off");
    }
  }

  useEffect(() => {
    if (!open || !memberId) return;

    if (!notificationsLoaded.current) {
      notificationsLoaded.current = true;
       
      setCursor(null);
      setHasMore(true);
      fetchNotifications(true, null);
    }

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
        setNotifications((prev) => {
          const existing = prev.find((n) => n.noti_id === updated.noti_id);
          if (existing && !existing.read_yn && updated.read_yn) {
            setUnreadCount((c) => Math.max(0, c - 1));
          } else if (existing && existing.read_yn && !updated.read_yn) {
            setUnreadCount((c) => c + 1);
          }
          return prev.map((n) => n.noti_id === updated.noti_id ? { ...n, ...updated } : n);
        });
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
                <button type="button" onClick={() => { setView("settings"); fetchPrefs(); refreshPushState(); }} className="text-muted-foreground" aria-label="알림 설정">
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
                {/* 푸시 알림(이 기기) — 타입별 설정과 다른 층위. 맨 위에 구분선으로 분리 */}
                {pushState !== "unsupported" && (
                  <>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex flex-col">
                        <Body className="text-[13px]">푸시 알림</Body>
                        {pushState === "denied" && (
                          <Caption className="mt-0.5 text-[11px]">
                            기기 설정에서 알림을 허용해 주세요
                          </Caption>
                        )}
                        {pushState === "install" && (
                          <Caption className="mt-0.5 text-[11px]">
                            홈 화면에 추가하면 받을 수 있어요
                          </Caption>
                        )}
                      </div>
                      {(pushState === "on" || pushState === "off") && (
                        <Switch
                          checked={pushState === "on"}
                          onCheckedChange={handlePushToggle}
                          aria-label="푸시 알림"
                        />
                      )}
                    </div>
                    <div className="mx-4 border-b border-border" />
                  </>
                )}
                {Object.entries(NOTI_TYPE_LABELS).map(([type, label]) => (
                  <div key={type} className="flex items-center justify-between px-4 py-2.5">
                    <Body className="text-[13px]">{label}</Body>
                    <Switch checked={getPrefEnabled(type)} onCheckedChange={(val) => handlePrefToggle(type, val)} aria-label={label} />
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
