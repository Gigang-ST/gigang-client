"use client";

import { useEffect, useRef, useState } from "react";

import { Bell, Settings, Trash2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { formatKST, todayKST } from "@/lib/dayjs";
import {
  canUsePush,
  getPermission,
  hasSubscription,
  needsInstall,
  subscribePush,
  unsubscribePush,
} from "@/lib/push/client";
import {
  appendNotifications,
  clearAll,
  getCursor,
  getUnreadDelta,
  markAllRead as storeMarkAllRead,
  markRead,
  removeNotification,
  resetNotifications,
  setNotifications as storeSetNotifications,
  syncUnreadCount,
  useHasMore,
  useNotifications,
  useNotificationsLoaded,
  useUnreadCount,
} from "@/lib/notifications/store";
import type { Notification, NotificationPref } from "@/lib/queries/notification";

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
  memberId?: string;
  disabled?: boolean;
};

// 껐다 켤 수 있는 알림만 노출. fdbk_rspd(내 건의 답변)는 항상 받아야 하는 필수 알림이라 제외.
const NOTI_TYPE_LABELS: Record<string, string> = {
  gthr_new: "새 모임 등록",
  gthr_upd: "참가 모임 수정·삭제",
  gthr_cncl: "내 모임 참석 취소",
  gthr_promo: "대기 승급",
  // 대기 승급과 따로 끌 수 있어야 한다 — 저건 "이미 확정됐다"는 통보고, 이건 시작 2시간
  // 전부터 선착순으로 열렸을 때 "가서 직접 누르라"는 재촉이라 성격이 다르다.
  gthr_seat: "대기 중 빈 자리",
  // 새 참가 신청은 개설자·운영진이 받는 운영성 알림이라 끌 수 있다.
  // 반대로 확정(gthr_aprv)·반려(gthr_rjct)는 여기 넣지 않는다 — 입금해 놓고 결과를 못 받으면
  // 사용자는 영문도 모른 채 기다리게 된다. fdbk_rspd 와 같은 이유의 필수 알림이다.
  //
  // "내 모임"이라고 쓰지 않는다: 수신자가 개설자 **+ 팀 운영진**이라 운영진은 남이 만든
  // 모임의 신청도 받는다(승인 권한이 있으니까). "접수"는 내가 처리할 것이 들어왔다는 뜻이라
  // 두 경우를 다 덮는다. 승인제를 안 켠 모임은 신청 자체가 없어 이 알림도 없다.
  gthr_aply: "모임 참가 신청 접수",
  sch_post_new: "새 정보 등록",
  ttl_grnt: "칭호 획득",
};

type ViewType = "list" | "settings";

export function NotificationBellIcon({ memberId, disabled }: NotificationBellIconProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewType>("list");
  /**
   * 목록·뱃지수·페이지네이션은 전부 **모듈 store**가 들고 있다(`lib/notifications/store.ts`).
   *
   * 이 컴포넌트는 각 탭 헤더 안에 있어 **탭을 옮길 때마다 죽고 새로 태어난다.**
   * state로 들면 이동마다 목록이 사라져 다시 받아야 하고, Realtime 채널도 끊겼다 붙는다.
   * store는 앱이 켜져 있는 동안 살아 있으므로 몇 번을 다시 태어나도 그대로다.
   * 채널 소유와 최초 로드는 루트의 `NotificationChannel`이 맡는다 — 여기선 **읽기만** 한다.
   */
  const notifications = useNotifications();
  const unreadCount = useUnreadCount();
  const hasMore = useHasMore();
  const loaded = useNotificationsLoaded();
  const [prefs, setPrefs] = useState<NotificationPref[]>([]);
  // 푸시: null=판단중, "on"/"off"=토글 가능, "denied"=OS 차단, "install"=iOS 설치 필요, "unsupported"=대상 아님
  const [pushState, setPushState] = useState<
    "on" | "off" | "denied" | "install" | "unsupported" | null
  >(null);
  const [loading, setLoading] = useState(false);
  // 푸시 토글 처리 중 여부 — 응답 오기 전까지 중복 클릭 차단
  const [pushPending, setPushPending] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  // 조회 실패를 **빈 상태와 구분해서** 보여주기 위한 플래그. 이게 없으면 실패했을 때도
  // "아직 알림이 없어요"가 떠서 사용자가 "없구나"로 오해하고 재시도할 생각을 못 한다.
  const [loadError, setLoadError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  /**
   * 지금 이 순간의 주인 — 진행 중인 조회가 **누구 것이었는지** 대조하는 데 쓴다.
   *
   * `fetchMore`의 클로저 `memberId`는 요청을 **띄운 시점**의 값이라, 응답이 오는 사이
   * 계정이 바뀌어도 그대로다. ref로 현재 값을 따로 들고 있어야 둘을 비교할 수 있다.
   */
  const memberIdRef = useRef(memberId);
  useEffect(() => {
    memberIdRef.current = memberId;
  }, [memberId]);

  /**
   * 목록을 더 받는다 — 커서가 있으면 다음 장, 없으면 첫 장.
   *
   * 첫 장은 보통 루트의 `NotificationChannel`이 이미 받아 뒀다. 여기서 첫 장을 받는 건
   * **그게 실패했을 때뿐**이다(그 경우 store의 `loaded`가 false로 남는다).
   */
  async function fetchMore() {
    if (!memberId || loading) return;
    setLoading(true);
    setLoadError(false);
    // 누구 것인지 적어 둔다 — 응답이 오기 전에 계정이 바뀌면 이 결과는 **남의 알림**이다.
    // 채널 쪽 `resetNotifications()`가 store를 비운 뒤 이게 도착하면 비운 걸 되살린다.
    const owner = memberId;
    // fetch가 도는 동안 도착한 Realtime 알림이 서버 카운트에 덮이지 않게 눈금을 적어 둔다.
    const delta = getUnreadDelta();
    try {
      const params = new URLSearchParams({ limit: "20" });
      const cur = getCursor();
      if (cur) params.set("cursor", cur);
      const res = await fetch(`/api/notifications?${params}`);
      // ⚠️ **`res.ok`를 반드시 본다.** 이 API는 실패해도 `{ error }`라는 **정상 JSON**을
      // 돌려주므로, 안 보면 `json.notifications`가 undefined → 빈 배열로 읽힌다. 그러면
      // `storeSetNotifications([])`가 `loaded = true`·`hasMore = false`로 만들어
      // **"아직 알림이 없어요"가 뜨고 재시도 경로 둘이 세션 내내 닫힌다**(루트 채널의
      // `isLoaded()` 가드 + 아래 open 이펙트). 알림이 있는데도 영영 안 보이게 된다.
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const json = await res.json();
      // 기다리는 사이 주인이 바뀌었으면 통째로 버린다(§owner).
      if (memberIdRef.current !== owner) return;
      const items: Notification[] = json.notifications ?? [];
      if (cur) {
        appendNotifications(items);
      } else {
        storeSetNotifications(items);
        if (typeof json.unreadCount === "number") syncUnreadCount(json.unreadCount, delta);
      }
    } catch {
      setLoadError(true);
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
    if (pushPending) return; // 중복 클릭 차단 (응답 오기 전까지)
    const prev = pushState;
    setPushPending(true);
    try {
      if (next) {
        // 권한이 이미 있으면 즉시 on으로 낙관적 표시 (구독 생성은 백그라운드).
        // 권한이 default면 OS 권한창 응답이 필수라 낙관 처리하지 않고 기다린다.
        const canOptimistic = getPermission() === "granted";
        if (canOptimistic) setPushState("on");

        const result = await subscribePush();
        if (result.ok) {
          setPushState("on");
          if (!canOptimistic) toast.success("푸시 알림이 켜졌어요");
        } else if (result.reason === "denied") {
          setPushState("denied");
          toast("기기 설정에서 알림을 허용해 주세요");
        } else if (result.reason === "needs-install") {
          setPushState("install");
        } else {
          setPushState(prev); // 실패 → 이전 상태로 롤백
          toast.error("푸시 알림을 켜지 못했어요");
        }
      } else {
        // 끄기는 즉시 반영 (실패 거의 없음). 실패 시 롤백.
        setPushState("off");
        try {
          await unsubscribePush();
        } catch {
          setPushState(prev);
          toast.error("푸시 알림을 끄지 못했어요");
        }
      }
    } finally {
      setPushPending(false);
    }
  }

  // Realtime 구독은 **여기 없다.** 루트의 `NotificationChannel`이 소유한다 — 벨이 들고 있으면
  // 탭을 옮길 때마다 끊겼다 붙는다(§components/notifications/notification-channel.tsx).

  // 팝오버를 열었는데 아직 목록이 없으면(루트의 최초 로드가 실패했을 때) 여기서 다시 시도한다.
  // `fetchMore`가 맨 앞에서 `setLoading(true)`를 하므로 **마이크로태스크로 한 번 미룬다** —
  // effect 본문에서 동기로 setState 하면 연쇄 렌더가 된다(react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open || !memberId || loaded || loading) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void fetchMore();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberId, loaded]);

  // 팝오버 내부 스크롤 무한스크롤
  useEffect(() => {
    if (!hasMore || loading || !open) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) void fetchMore(); },
      { threshold: 0.1 },
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, open, notifications.length]);

  // 낙관적으로 먼저 반영하되 **실패하면 되돌린다.** store가 세션 내내 살아 있어서
  // (탭을 옮겨도 리마운트로 초기화되지 않는다) 실패를 방치하면 그 화면이 계속 남는다.
  // 되돌리는 방법은 서버에서 다시 받아오는 것 — 낙관적 변경 전 상태를 따로 들고 있지 않다.
  async function handleMarkAllRead() {
    storeMarkAllRead();
    try {
      await markAllNotificationsRead();
    } catch {
      toast.error("읽음 처리에 실패했어요");
      resetNotifications();
      await fetchMore();
    }
  }

  async function handleDeleteAll() {
    clearAll();
    setDeleteAllOpen(false);
    try {
      await deleteAllNotifications();
    } catch {
      toast.error("알림을 지우지 못했어요");
      resetNotifications();
      await fetchMore();
    }
  }

  function handleReadItem(notiId: string) {
    markRead(notiId);
  }

  function handleDeleteItem(notiId: string) {
    removeNotification(notiId);
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

  // "오늘"도, 비교 대상인 crt_at(timestamptz)도 **KST로 찍어야** 같은 기준이 된다(§lib/dayjs formatKST)
  const today = todayKST();
  const todayNotis = notifications.filter((n) => formatKST(n.crt_at, "YYYY-MM-DD") === today);
  const prevNotis = notifications.filter((n) => formatKST(n.crt_at, "YYYY-MM-DD") !== today);

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
                {/* 실패는 빈 상태와 **다르게** 말한다 — "없다"로 보이면 재시도할 생각을 못 한다. */}
                {notifications.length === 0 && !loading && loadError ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10">
                    <Bell className="size-8 text-muted-foreground/30" />
                    <Caption>알림을 불러오지 못했어요</Caption>
                    <button
                      type="button"
                      onClick={() => void fetchMore()}
                      className="text-xs text-primary"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : /* ⚠️ 빈 상태는 **다 받아왔을 때만**(`loaded`) 보여준다. 아직 받는 중인데
                      "없어요"를 띄우면, 알림이 있는 사람에게 한 번 깜빡이고 목록이 뒤늦게
                      들어찬다 — 목록을 서버 렌더에서 뗀 뒤 실제로 그 증상이 났다. */
                notifications.length === 0 && !loading && loaded ? (
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
                      {pushState === "on" || pushState === "off" ? (
                        <Switch
                          checked={pushState === "on"}
                          onCheckedChange={handlePushToggle}
                          disabled={pushPending}
                          aria-label="푸시 알림"
                        />
                      ) : (
                        // denied·install: 토글을 숨기지 않고 비활성화해 노출 (왜 못 켜는지 문구로 안내)
                        <Switch checked={false} disabled aria-label="푸시 알림" />
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
