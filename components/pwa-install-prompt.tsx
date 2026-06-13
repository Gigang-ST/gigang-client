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
    if (variant === "banner" && recentlyDismissed()) return;

    if (isIOS()) {
      // iOS는 beforeinstallprompt 미지원 → 안내 모드
      setVisible(true);
      return;
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
      홈 화면에 추가
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

  // banner
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-40 px-4",
        className,
      )}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border-[1.5px] border-border bg-background p-3 shadow-lg">
        <div className="flex-1">
          <Body className="font-semibold">기강을 홈 화면에 추가</Body>
          <Caption className="mt-0.5 block">앱처럼 빠르게 열어요</Caption>
          {iosGuideBlock}
        </div>
        {installButton}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="닫기"
          className="text-muted-foreground"
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}
