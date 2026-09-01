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
import { SITE_URL, siteContent } from "@/config";
import { shellWidthBootScript } from "@/lib/app-shell";
import { env } from "@/lib/env";
import { organizationJsonLd } from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  /**
   * `default`는 홈 제목, `template`은 하위 지면 제목이다.
   * 지면마다 제목이 갈려야 검색결과에서 서로 다른 문서로 잡힌다 — 전 지면이 "기강"
   * 하나를 쓰면 중복 문서로 묶여 색인에서 밀린다.
   */
  title: {
    default: siteContent.metadata.searchTitle,
    template: siteContent.metadata.titleTemplate,
  },
  description: siteContent.metadata.description,
  /** 홈의 대표 URL. www 호스트로 들어와도 apex 한 곳으로 모은다. */
  alternates: { canonical: "/" },
  /**
   * 네이버 서치어드바이저 소유확인.
   *
   * 값은 서치어드바이저에서 사이트를 등록해야 나온다 — 미설정이면 태그를 아예 안 낸다
   * (빈 content로 나가면 확인이 실패한다). 메타태그 방식은 연 1회 재인증이 필요하다.
   */
  ...(env.NAVER_SITE_VERIFICATION
    ? {
        verification: {
          other: {
            "naver-site-verification": env.NAVER_SITE_VERIFICATION,
          },
        },
      }
    : {}),
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
    title: siteContent.metadata.searchTitle,
    description: siteContent.metadata.description,
    siteName: siteContent.brand.fullName,
    url: SITE_URL,
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteContent.metadata.searchTitle,
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
        {/* 구조화 데이터 — 검색엔진에 "이 사이트는 어떤 단체인가"를 기계가 읽는 형태로 준다.
            본문 텍스트만으로는 크루 이름·활동 지역·공식 SNS가 엮이지 않는다. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
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
