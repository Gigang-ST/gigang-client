"use client";

import { useEffect, useState } from "react";

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
  // Android WebView 힌트 (소모임 등 시스템 WebView 기반 인앱 브라우저 포함)
  if (/wv\)/.test(ua) && !ua.includes("chrome")) return "other";
  // iOS 비-Safari WebView: iOS인데 Safari/Chrome/Firefox 토큰이 없으면 인앱으로 간주
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

/** PWA로 홈 화면에서 실행 중(이미 설치)인지 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari 전용 navigator.standalone
  const iosStandalone = (navigator as { standalone?: boolean }).standalone;
  return Boolean(mql || iosStandalone);
}

function openExternalBrowser(url: string) {
  if (isIOS()) {
    // iOS: Safari로 열기 시도
    window.location.href = url;
  } else {
    // Android: intent:// 로 Chrome 열기
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

export function InAppBrowserGate({ children }: { children: React.ReactNode }) {
  const [inApp, setInApp] = useState<InAppEnv>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setInApp(detectInAppBrowser());
    setChecked(true);
  }, []);

  // 아직 체크 안 됨 → 깜빡임 방지를 위해 children 렌더
  if (!checked) return <>{children}</>;

  // 인앱 브라우저가 아님 → 정상 렌더
  if (!inApp) return <>{children}</>;

  const appName = APP_LABELS[inApp] ?? "앱";
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl">🌐</div>
        <h1 className="mt-4 text-xl font-bold text-foreground">
          {appName}에선 가입할 수 없어요
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          크롬 또는 사파리로 열면
          <br />1분이면 가입이 끝나요.
        </p>

        {/* Android: 자동 열기 버튼 */}
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

        {/* iOS: 안내 */}
        {isIOS() && (
          <div className="mt-6 rounded-xl border border-border bg-secondary/50 p-4 text-left">
            <p className="text-sm font-bold text-foreground">
              Safari에서 여는 방법
            </p>
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

        {/* URL 복사 폴백 */}
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
