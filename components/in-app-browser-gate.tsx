"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type InAppEnv = "kakao" | "line" | "instagram" | "facebook" | "other" | null;

function detectInAppBrowser(): InAppEnv {
  if (typeof window === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("kakaotalk")) return "kakao";
  if (ua.includes("line/")) return "line";
  if (ua.includes("instagram")) return "instagram";
  if (ua.includes("fban") || ua.includes("fbav")) return "facebook";
  // 일반적인 인앱 브라우저 감지 (WebView 힌트)
  if (/wv\)/.test(ua) && !ua.includes("chrome")) return "other";
  return null;
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
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
  other: "앱",
};

export function InAppBrowserGate({ children }: { children: React.ReactNode }) {
  const [inApp, setInApp] = useState<InAppEnv | null>(null);
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
    <div className="flex min-h-svh flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl">🌐</div>
        <h1 className="mt-4 text-xl font-bold text-foreground">
          외부 브라우저에서 열어주세요
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {appName} 내부 브라우저에서는 로그인이 정상적으로
          <br />
          동작하지 않을 수 있습니다.
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
