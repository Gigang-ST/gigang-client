import { Suspense } from "react";

import type { Metadata, Viewport } from "next";

import { Oswald } from "next/font/google";
import localFont from "next/font/local";

import Script from "next/script";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";

import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { Providers } from "@/components/providers";
import { PwaInstallPromptGate } from "@/components/pwa-install-prompt-gate";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

import "./globals.css";
import { siteContent } from "@/config";

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
 * 제호·헤드라인 — 리디바탕(SIL OFL).
 *
 * 전자책용으로 설계된 명조라 화면에서 나눔명조보다 잘 읽힌다.
 * 산세리프 본문과의 대비가 "기사" 위계를 만든다. 한글 서브셋 woff2(278KB).
 */
const ridibatang = localFont({
  src: "./fonts/ridibatang/RIDIBatang.woff2",
  variable: "--font-ridibatang",
  display: "swap",
  weight: "400",
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
        className={`${pretendard.variable} ${ridibatang.variable} ${oswald.variable} font-sans antialiased`}
      >
        <Providers>
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
