import { Suspense } from "react";

import type { Metadata, Viewport } from "next";

import { Oswald } from "next/font/google";
import localFont from "next/font/local";

import Script from "next/script";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";

import { AppWidthControl } from "@/components/app-width-control";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { Providers } from "@/components/providers";
import { PwaInstallPromptGate } from "@/components/pwa-install-prompt-gate";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

import "./globals.css";
import { siteContent } from "@/config";
import { shellWidthBootScript } from "@/lib/app-shell";

const SITE_URL = "https://gigang.team";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: siteContent.metadata.title,
  description: siteContent.metadata.description,
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon-180x180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: siteContent.metadata.title,
    description: siteContent.metadata.description,
    siteName: siteContent.brand.fullName,
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteContent.metadata.title,
    description: siteContent.metadata.description,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "기강",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

/**
 * 본문 — Pretendard.
 *
 * Inter를 라틴 베이스로 만든 폰트라 기존 레이아웃을 그대로 유지하면서 한글만 제대로 렌더된다
 * (그 전까지 한글은 OS 기본 폰트로 떨어지고 있었다). Variable 하나로 weight 45~920을 덮는다.
 */
const pretendard = localFont({
  src: "./fonts/pretendard/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

/**
 * 기록·순위 숫자 — Oswald. **라틴만 로드**(한글은 절대 이 폰트로 렌더하지 않는다).
 * 6/8·1/7 구분이 좋은 콘덴스드라 기록표에 적합.
 */
const oswald = Oswald({
  variable: "--font-oswald",
  display: "swap",
  subsets: ["latin"],
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${pretendard.variable} ${oswald.variable} app-viewport font-sans antialiased`}
      >
        {/* 셸 폭 — 첫 페인트 전에 저장된 폭을 적용한다(next-themes가 테마에 하는 것과 같은 이유).
            이게 없으면 새로고침마다 기본 폭으로 그렸다가 넓어지는 점프가 보인다. */}
        <script dangerouslySetInnerHTML={{ __html: shellWidthBootScript }} />
        <Providers>
          {/* 앱 셸 — 데스크톱에서 본문을 폰 폭으로 묶는다(globals.css `.app-shell`).
              모바일에선 max-width가 안 걸려 아무 영향이 없다. 셸 안의 `fixed` 요소는
              여기 갇히지 않으므로(뷰포트 기준) 각자 `.app-fixed`/`.app-fab`을 붙인다. */}
          <div className="app-shell">
            <NuqsAdapter>
              <Suspense fallback={null}>
                <InAppBrowserGate>{children}</InAppBrowserGate>
              </Suspense>
              {/* 설치 배너: 비로그인 포함 전원 노출. 로그인 조회는 Suspense 경계 안에 가둬
                  cookies() 접근이 페이지 본문 렌더를 막지 않게 한다. */}
              <Suspense fallback={null}>
                <PwaInstallPromptGate />
              </Suspense>
              <ServiceWorkerRegister />
            </NuqsAdapter>
          </div>
          {/* 폭 컨트롤 — 셸 바깥 지면에 서므로 셸 밖에 둔다. 지면이 안 남으면(=폰) 렌더 안 함. */}
          <AppWidthControl />
          {/* 전역 토스트 — 참석 피드백·배치 결과 등. sonner 기본 흥(아이콘·애니메이션) 유지하고
              폭(내용만큼)·모서리·그림자만 프로젝트 카드 톤으로 보정. richColors 미사용(투박함 제거). */}
          <Toaster
            position="bottom-center"
            offset="80px"
            mobileOffset="80px"
            style={{ "--width": "fit-content" } as React.CSSProperties}
            toastOptions={{
              classNames: {
                toast: "!rounded-2xl !border-border !shadow-lg !max-w-[90vw]",
                title: "!text-sm !font-medium",
              },
            }}
          />
        </Providers>
      </body>
      <Script
        id="_ga-init"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{
          __html: `window['dataLayer']=window['dataLayer']||[];function gtag(){window['dataLayer'].push(arguments);}gtag('js',new Date());gtag('config','G-H9LXJH97CZ');`,
        }}
      />
      <Script
        id="_ga"
        src="https://www.googletagmanager.com/gtag/js?id=G-H9LXJH97CZ"
        strategy="lazyOnload"
      />
    </html>
  );
}
