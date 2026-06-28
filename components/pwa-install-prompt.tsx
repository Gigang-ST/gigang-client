"use client";

import { useEffect, useState } from "react";

import { Share, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { Body, Caption } from "@/components/common/typography";
import {
  detectInAppBrowser,
  isIOS,
  isStandalone,
} from "@/components/in-app-browser-gate";
import { Button } from "@/components/ui/button";


type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 7;

function recentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  const elapsedDays = (Date.now() - at) / (1000 * 60 * 60 * 24);
  return elapsedDays < DISMISS_DAYS;
}

type PwaInstallPromptProps = {
  /** banner=전역 하단 고정(7일 dismiss), inline=가입 완료 카드 내부 */
  variant?: "banner" | "inline";
  className?: string;
};

/**
 * PWA 홈 화면 설치 유도.
 * - 이미 설치(standalone)되었거나 인앱 브라우저면 렌더하지 않음.
 * - Android/Chrome: beforeinstallprompt 캡처 후 네이티브 설치.
 * - iOS Safari: "공유 → 홈 화면에 추가" 안내.
 * - 푸시 알림은 설치된 PWA에서만 받는다(iOS·Android 공통). 웹에서는 권한을 요청하지 않고
 *   설치만 유도하며, 설치 후 PushPermissionPrompt가 권한을 유도한다.
 */
export function PwaInstallPrompt({
  variant = "banner",
  className,
}: PwaInstallPromptProps) {
  const [visible, setVisible] = useState(false);
  const [iosGuide, setIosGuide] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    // 설치됨/인앱이면 표시 안 함
    if (isStandalone() || detectInAppBrowser() !== null) return;
    // banner(전역)는 모바일에서만 — 데스크톱은 푸시·설치 대상 제외 (정책 1).
    // inline(가입 완료 화면)은 모바일 가정이라 이 게이트를 적용하지 않는다.
    if (variant === "banner") {
      const isAndroid = /android/i.test(navigator.userAgent);
      if (!isIOS() && !isAndroid) return; // 데스크톱
    }
    if (variant === "banner" && recentlyDismissed()) return;

    if (isIOS()) {
      // iOS는 beforeinstallprompt 미지원 → 안내 모드 (setTimeout으로 effect 내 직접 setState 회피)
      const id = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(id);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [variant]);

  if (!visible) return null;

  // 정책: 웹(브라우저)에서는 푸시 권한을 요청하지 않는다 (iOS·Android 공통).
  // 푸시는 설치된 PWA에서만 — 설치 후 PushPermissionPrompt가 권한을 유도한다.
  const handleInstall = async () => {
    if (isIOS()) {
      setIosGuide((v) => !v);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    // 취소(dismissed) 시 banner는 7일 억제 (accepted면 설치되어 다음엔 standalone)
    if (choice.outcome === "dismissed" && variant === "banner") {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setDeferred(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    if (variant === "banner") {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setVisible(false);
  };

  const installButton = (
    <Button
      type="button"
      onClick={handleInstall}
      className="rounded-xl font-bold"
      size={variant === "inline" ? "lg" : "default"}
    >
      추가하기 🫡
    </Button>
  );

  const iosGuideBlock = iosGuide ? (
    <div className="mt-3 rounded-xl border border-border bg-secondary/50 p-3 text-left">
      <Caption className="flex items-center gap-1 font-semibold text-foreground">
        <Share className="size-4" /> 공유 버튼을 누른 뒤
      </Caption>
      <Caption className="mt-1 block">
        &quot;홈 화면에 추가&quot;를 선택하세요.
      </Caption>
    </div>
  ) : null;

  if (variant === "inline") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {installButton}
        {iosGuideBlock}
      </div>
    );
  }

  // banner — 알림 권한 배너(PushPermissionPrompt)와 동일하게 상단 고정.
  // 둘은 isStandalone 게이트로 상호 배타적이라 동시에 뜨지 않는다.
  return (
    <div
      className={cn(
        "fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-40 px-4",
        className,
      )}
    >
      <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border-[1.5px] border-border bg-background p-4 shadow-lg">
        {/* 상단: 문구(전폭) + 닫기 */}
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Body className="font-bold leading-snug">
              📲 기강이 풀렸군. 홈 화면에 모시고 알림 켜라!
            </Body>
            <Caption className="mt-1 block leading-relaxed">
              홈 화면에 추가해야{" "}
              <span className="font-semibold text-foreground">새 모임·정보·댓글</span>{" "}
              알림을 받을 수 있다. 🫡
            </Caption>
            {iosGuideBlock}
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="닫기"
            className="-mr-1.5 -mt-1.5 flex size-9 shrink-0 items-center justify-center text-muted-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        {/* 하단: 전폭 버튼 */}
        <Button
          type="button"
          onClick={handleInstall}
          className="w-full rounded-xl font-bold"
        >
          추가하기 🫡
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="self-center text-muted-foreground"
        >
          <Caption>일주일간 보지 않기</Caption>
        </button>
      </div>
    </div>
  );
}
