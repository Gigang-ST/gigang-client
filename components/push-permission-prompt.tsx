"use client";

import { useEffect, useState } from "react";

import { Bell, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  canUsePush,
  getPermission,
  hasSubscription,
  subscribePush,
} from "@/lib/push/client";

import { Body, Caption } from "@/components/common/typography";
import { isStandalone } from "@/components/in-app-browser-gate";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "push-prompt-dismissed";

/**
 * 설치된 PWA에서 푸시 알림 권한을 유도하는 soft prompt (상단 배너).
 *
 * 설계 정책:
 * - **설치된 PWA에서만** 표시한다. 미설치 웹(Android/iOS)의 설치 유도와
 *   Android의 "설치 안보기 → 권한 요청" 폴백은 PwaInstallPrompt가 담당한다.
 * - 데스크톱·iOS 미설치는 canUsePush 게이트로도 자동 제외된다.
 * - OS 권한창을 자동으로 띄우지 않고, 먼저 안내를 보여준 뒤 "알림 받기" 클릭 시 요청.
 * - 거부하면 다시 자동으로 조르지 않는다 — localStorage 영구 dismiss.
 *   마음 바뀌면 우측 상단 알림 설정 토글에서 직접 켠다.
 */
export function PushPermissionPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY)) return;
    // 설치된 PWA에서만 (미설치 웹은 설치 배너가 담당)
    if (!isStandalone()) return;
    if (!canUsePush()) return;

    // 이미 권한을 결정했거나(허용/거부) 구독이 있으면 띄우지 않음
    const perm = getPermission();
    if (perm !== "default") return;

    let cancelled = false;
    void hasSubscription().then((has) => {
      if (!cancelled && !has) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const dismissForever = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const handleEnable = async () => {
    const result = await subscribePush();
    setVisible(false);
    if (result.ok) {
      // 성공: 영구 dismiss (이미 구독됨)
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
      toast.success("푸시 알림이 켜졌어요");
    } else if (result.reason === "denied") {
      // 사용자가 거부: 영구 dismiss (다시 조르지 않음)
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
      toast("알림은 우측 상단 알림 설정에서 다시 켤 수 있어요");
    } else {
      // 일시 오류(네트워크 등): 영구 dismiss하지 않음 → 다음 기회에 다시 안내
      toast.error("푸시 알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요");
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-40 px-4",
      )}
    >
      <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border-[1.5px] border-border bg-background p-4 shadow-lg">
        {/* 상단: 아이콘 + 문구 + 닫기 */}
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
            <Bell className="size-5 text-foreground" aria-hidden="true" />
          </div>
          <div className="flex-1 pt-0.5">
            <Body className="font-semibold">새 알림 받기</Body>
            <Caption className="mt-1 block leading-relaxed">
              모임·답변 소식을 푸시로 받아보세요.
            </Caption>
          </div>
          <button
            type="button"
            onClick={dismissForever}
            aria-label="닫기"
            className="-mr-1.5 -mt-1.5 flex size-11 shrink-0 items-center justify-center text-muted-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {/* 하단: 버튼 (전폭) */}
        <Button
          type="button"
          onClick={handleEnable}
          className="w-full rounded-xl font-bold"
          aria-label="푸시 알림 받기"
        >
          알림 받기
        </Button>
        <Caption className="text-center text-[11px] text-muted-foreground/70">
          나중에 우측 상단 알림 설정에서도 켤 수 있어요
        </Caption>
      </div>
    </div>
  );
}
