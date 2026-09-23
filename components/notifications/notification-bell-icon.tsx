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
  getNotificationRevision,
  markAllRead as storeMarkAllRead,
  markRead,
  PAGE_SIZE,
  removeNotification,
  useHasMore,
  useNotifications,
  useNotificationsLoaded,
  useUnreadCount,
} from "@/lib/notifications/store";
import { getNotificationSession, isNotificationMutationPending, mutateNotifications, refreshNotifications } from "@/lib/notifications/refresh";
import type { Notification, NotificationPref } from "@/lib/queries/notification";

import { deleteAllNotifications } from "@/app/actions/delete-all-notifications";
import { markAllNotificationsRead } from "@/app/actions/mark-all-notifications-read";
import { upsertNotiPref } from "@/app/actions/upsert-noti-pref";

import { Body, Caption, SectionLabel } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

import { NotificationItem } from "@/components/notifications/notification-item";

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
  // 목록·뱃지는 탭 이동에도 유지한다. 최초 조회·복귀·푸시는 루트에서,
  // 알림창 열기와 더보기는 여기서 요청한다.
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
  /** 다음 장만 덧붙인다. 최신 첫 장은 공유 조회를 사용한다. */
  async function fetchMore() {
    // 쓰기가 도는 동안엔 다음 장을 받지 않는다 — 받아 봐야 아래 revision 가드에서 버려지고,
    // 버린 채 `hasMore`가 그대로면 센티넬이 계속 교차해 조회만 반복한다. 쓰기는 왕복 한 번
    // 길이라 곧 풀리고, 그 사이 스크롤이 조금만 움직여도 교차 이벤트가 다시 뜬다.
    if (!memberId || loading || isNotificationMutationPending()) return;
    const owner = getNotificationSession(memberId);
    if (!owner) return;
    setLoading(true);
    setLoadError(false);
    const revision = getNotificationRevision();
    try {
      const cur = getCursor();
      if (!cur) {
        const ok = await refreshNotifications(memberId);
        if (getNotificationSession(memberId) === owner) setLoadError(!ok);
        return;
      }
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), cursor: cur });
      const res = await fetch(`/api/notifications?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("알림 조회 실패");
      const json = await res.json();
      // 계정 전환·첫 장 교체·읽음/삭제 뒤 도착한 옛 페이지는 버린다.
      if (getNotificationSession(memberId) !== owner || getNotificationRevision() !== revision || isNotificationMutationPending()) return;
      appendNotifications((json.notifications ?? []) as Notification[]);
    } catch {
      if (getNotificationSession(memberId) === owner) setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function refreshList() {
    if (!memberId) return;
    const owner = getNotificationSession(memberId);
    setLoading(true);
    setLoadError(false);
    try {
      const ok = await refreshNotifications(memberId);
      // ⚠️ `owner`가 null일 때도(세션이 아직/영영 없을 때) 실패로 표시한다. 예전엔 `owner &&`로
      // 걸러서, 그 경우 `length 0 · loading false · loadError false · loaded false`가 되어
      // **아래 렌더 분기 셋이 전부 빗나가 본문이 아무 문구 없는 흰 칸**으로 남았다.
      if (getNotificationSession(memberId) === owner) setLoadError(!ok);
    } catch {
      if (getNotificationSession(memberId) === owner) setLoadError(true);
    } finally {
      // 던지면 로딩이 true에 굳고, 그러면 빈 상태·에러 상태가 둘 다 `!loading` 뒤에 가려
      // "로딩 중..."만 남는다. `fetchMore`와 같은 형태로 맞춘다.
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

  // 알림창은 열 때마다 최신 첫 장을 받는다. 기존 목록은 조회 중에도 유지한다.
  useEffect(() => {
    if (!open || !memberId) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refreshList();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberId]);

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
  // 공유 쓰기 가드가 액션 종료 전 재조회를 보류하고, 실패 시 서버 값으로 복원한다.
  async function handleMarkAllRead() {
    try {
      await mutateNotifications(storeMarkAllRead, markAllNotificationsRead);
    } catch {
      toast.error("읽음 처리에 실패했어요");
    }
  }

  async function handleDeleteAll() {
    setDeleteAllOpen(false);
    try {
      await mutateNotifications(clearAll, deleteAllNotifications);
    } catch {
      toast.error("알림을 지우지 못했어요");
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
                    {/* 재시도는 `refreshList` — 로딩·에러 표면을 소유한 쪽이다. `fetchMore`는
                        쓰기 중이면 아무 표시 없이 빠져나가 눌러도 반응이 없는 버튼이 된다. */}
                    <button
                      type="button"
                      onClick={() => void refreshList()}
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
