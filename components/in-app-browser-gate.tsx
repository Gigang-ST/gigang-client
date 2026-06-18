"use client";

import { useState, useSyncExternalStore } from "react";

import { usePathname } from "next/navigation";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

export type InAppEnv =
  | "kakao"
  | "line"
  | "instagram"
  | "facebook"
  | "naver"
  | "band"
  | "daum"
  | "other"
  | null;

export function detectInAppBrowser(): InAppEnv {
  if (typeof window === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("kakaotalk")) return "kakao";
  if (ua.includes("line/")) return "line";
  if (ua.includes("instagram")) return "instagram";
  if (ua.includes("fban") || ua.includes("fbav")) return "facebook";
  if (ua.includes("naver(inapp")) return "naver";
  if (ua.includes("band")) return "band";
  if (ua.includes("daumapps")) return "daum";
  if (/wv\)/.test(ua) && !ua.includes("chrome")) return "other";
  const isIOSDevice = /iphone|ipad|ipod/.test(ua);
  const looksLikeRealBrowser =
    ua.includes("safari") || ua.includes("crios") || ua.includes("fxios");
  if (isIOSDevice && !looksLikeRealBrowser) return "other";
  return null;
}

export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as { standalone?: boolean }).standalone;
  return Boolean(mql || iosStandalone);
}

function openExternalBrowser(url: string) {
  if (isIOS()) {
    window.location.href = url;
  } else {
    const intentUrl =
      `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
    window.location.href = intentUrl;
  }
}

const APP_LABELS: Record<string, string> = {
  kakao: "카카오톡",
  line: "라인",
  instagram: "인스타그램",
  facebook: "페이스북",
  naver: "네이버 앱",
  band: "밴드",
  daum: "다음 앱",
  other: "앱",
};

/** 전체 화면 차단 — 로그인/가입 페이지용 */
function FullScreenGate({ inApp, isAuth }: { inApp: InAppEnv; isAuth: boolean }) {
  const appName = APP_LABELS[inApp ?? "other"] ?? "앱";
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  const title = isAuth
    ? `${appName}에서는 로그인할 수 없어요`
    : `${appName} 안에서는 가입할 수 없어요`;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl">🌐</div>
        <h1 className="mt-4 text-xl font-bold text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          크롬 또는 사파리로 열면
          <br />1분이면 완료돼요.
        </p>

        {!isIOS() && (
          <Button
            type="button"
            size="lg"
            onClick={() => openExternalBrowser(currentUrl)}
            className="mt-6 w-full rounded-xl font-bold"
          >
            Chrome에서 열기
          </Button>
        )}

        {isIOS() && (
          <div className="mt-6 rounded-xl border border-border bg-secondary/50 p-4 text-left">
            <p className="text-sm font-bold text-foreground">Safari에서 여는 방법</p>
            <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              {inApp === "kakao" ? (
                <>
                  <li>1. 오른쪽 하단 <strong className="text-foreground">⋯</strong> 버튼 탭</li>
                  <li>2. <strong className="text-foreground">&quot;다른 브라우저로 열기&quot;</strong> 선택</li>
                </>
              ) : (
                <>
                  <li>1. 오른쪽 하단 <strong className="text-foreground">⋯</strong> 또는 공유 버튼 탭</li>
                  <li>2. <strong className="text-foreground">&quot;Safari로 열기&quot;</strong> 선택</li>
                </>
              )}
            </ol>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            navigator.clipboard.writeText(currentUrl);
            alert("링크가 복사되었습니다.");
          }}
          className="mt-3 w-full rounded-xl text-muted-foreground"
        >
          링크 복사하기
        </Button>
      </div>
    </div>
  );
}

/** 상단 배너 — 일반 콘텐츠 페이지용 */
function BannerGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  if (dismissed) return <>{children}</>;

  return (
    <>
      <div className="sticky top-0 z-50 flex items-center gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
        <span className="flex-1 text-xs leading-snug">
          {isIOS()
            ? "Safari에서 열면 모든 기능을 사용할 수 있어요"
            : "Chrome에서 열면 모든 기능을 사용할 수 있어요"}
        </span>
        {!isIOS() && (
          <button
            type="button"
            onClick={() => openExternalBrowser(currentUrl)}
            className="shrink-0 rounded-md bg-primary-foreground px-2.5 py-1 text-xs font-bold text-primary"
          >
            열기
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 opacity-70"
          aria-label="닫기"
        >
          <X className="size-4" />
        </button>
      </div>
      {children}
    </>
  );
}

const noop = () => () => {};

/** 루트 레이아웃에 단 하나만 배치 */
export function InAppBrowserGate({ children }: { children: React.ReactNode }) {
  const inApp = useSyncExternalStore(
    noop,
    () => detectInAppBrowser(),
    () => null,
  );
  const pathname = usePathname();

  if (!inApp) return <>{children}</>;

  // 로그인·가입·온보딩 → 전체 차단
  const isBlockPage =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/newbie") ||
    pathname === "/onboarding";

  if (isBlockPage) {
    return (
      <FullScreenGate
        inApp={inApp}
        isAuth={pathname.startsWith("/auth")}
      />
    );
  }

  // 나머지 → 배너만
  return <BannerGate>{children}</BannerGate>;
}
