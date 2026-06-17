# 가입 위저드 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신입회원 가입(`/newbie`→`/auth/login`→`/onboarding`)을 공유 진행바를 가진 3단계 위저드로 개편하고, 인앱 브라우저 가입을 원천 차단하며, 가입 직후 PWA 홈 화면 설치까지 한 흐름으로 연결한다.

**Architecture:** 세 페이지가 공유하는 `SignupProgress` 진행바 컴포넌트와, 환경(설치됨/인앱/일반)에 따라 분기하는 `PwaInstallPrompt`를 신규 도입. `InAppBrowserGate`의 감지 로직을 export해 재사용하고 가입 흐름 전체에 적용. 온보딩 폼은 서버 액션(이미 계좌·은행·이메일 nullable 수용)을 건드리지 않고 UI만 간소화한다.

**Tech Stack:** Next.js(App Router) + React 19 + TypeScript, Tailwind v4, shadcn/ui, DESIGN.md 타이포 컴포넌트·색상 토큰. 검증: `pnpm run lint` + `pnpm run build` + Storybook(시각 확인). 단위 테스트 러너는 없음.

**검증 규약(모든 태스크 공통):** 코드 변경 후 `pnpm run lint` 통과 + `npx tsc --noEmit` 타입 통과. 페이지를 완성하는 태스크와 마지막 태스크는 `pnpm run build`까지. 신규 컴포넌트는 Storybook story를 추가해 시각 확인.

**커밋 규약:** Conventional Commits. subject 소문자 시작, 마침표 없음. 본문은 한국어 허용. Co-Authored-By trailer 포함. 커밋 메시지는 Bash heredoc(`git commit -F - <<'EOF'`)으로 전달(PowerShell here-string 금지 — commitlint 깨짐).

---

## File Structure

**신규:**
- `components/auth/signup-progress.tsx` — 3단계 공유 진행바(순수 프레젠테이션, 의존성 없음)
- `components/auth/signup-progress.stories.tsx` — 진행바 story
- `components/pwa-install-prompt.tsx` — PWA 설치 유도(banner/inline 두 모드)
- `components/pwa-install-prompt.stories.tsx` — 설치 프롬프트 story

**수정:**
- `components/in-app-browser-gate.tsx` — UA 패턴 보강 + `detectInAppBrowser`/`isIOS`/`isStandalone` export + 카피 개선
- `app/(info)/newbie/page.tsx` — 위저드 인트로로 전면 재작성
- `app/auth/login/page.tsx` — `InAppBrowserGate` 래핑 + 진행바(step 2)
- `app/(protected)/onboarding/page.tsx` — `InAppBrowserGate` 래핑 + `initialFullName` 추출·전달
- `components/auth/member-onboarding-form.tsx` — 진행바(step 3) + 폼 간소화(계좌 접이식) + 이름 prefill + 완료화면 설치 CTA + 계좌 나중에 링크
- `app/(main)/layout.tsx` — 전역 설치 배너 마운트
- `app/layout.tsx` — iOS PWA 메타 보강

**안 건드림:** `app/actions/onboarding-mem-v2.ts`, `lib/validations/member.ts`, OAuth 로직, `app/manifest.ts`, `/profile/bank`·`bank-info-form`.

---

## Task 1: SignupProgress 진행바 컴포넌트

**Files:**
- Create: `components/auth/signup-progress.tsx`
- Create: `components/auth/signup-progress.stories.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`components/auth/signup-progress.tsx`:

```tsx
import { Caption } from "@/components/common/typography";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 3;
const STEP_LABELS = ["시작", "로그인", "정보 입력"] as const;

type SignupProgressProps = {
  /** 현재 단계 (1=시작, 2=로그인, 3=정보 입력) */
  step: 1 | 2 | 3;
  /** 가입 완료 시 모든 칸을 채움 */
  done?: boolean;
};

/**
 * 가입 위저드 3단계 공유 진행바.
 * newbie(1)·login(2)·onboarding(3) 세 페이지가 동일하게 사용한다.
 * 화면 상단에 고정(fixed)되며 내부 콘텐츠는 max-w-md 중앙 정렬.
 */
export function SignupProgress({ step, done = false }: SignupProgressProps) {
  const filled = done ? TOTAL_STEPS : step;
  const currentLabel = done ? "완료" : STEP_LABELS[step - 1];

  return (
    <div className="fixed inset-x-0 top-0 z-40 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-md flex-col gap-2 px-6 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        <div className="flex items-center justify-between">
          <Caption className="font-semibold text-foreground">
            {currentLabel}
          </Caption>
          <Caption>
            {done ? TOTAL_STEPS : step}/{TOTAL_STEPS}
          </Caption>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < filled ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Story 작성**

`components/auth/signup-progress.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SignupProgress } from "@/components/auth/signup-progress";

const meta = {
  title: "Auth/SignupProgress",
  component: SignupProgress,
} satisfies Meta<typeof SignupProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Step1: Story = { args: { step: 1 } };
export const Step2: Story = { args: { step: 2 } };
export const Step3: Story = { args: { step: 3 } };
export const Done: Story = { args: { step: 3, done: true } };
```

- [ ] **Step 3: 검증**

Run: `pnpm run lint && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add components/auth/signup-progress.tsx components/auth/signup-progress.stories.tsx
git commit -F - <<'EOF'
feat(auth): add signup progress bar component

가입 위저드 newbie·login·onboarding 세 페이지가 공유하는
3단계 진행바. 상단 고정, 색상 토큰만 사용.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: InAppBrowserGate 감지 로직 export + UA 보강 + 카피 개선

**Files:**
- Modify: `components/in-app-browser-gate.tsx`

현재 `detectInAppBrowser`/`isIOS`는 모듈 내부 함수다. PwaInstallPrompt가 재사용하도록 export하고, 한국 인앱 브라우저 패턴(네이버·밴드·다음)과 iOS 비-Safari WebView 감지를 보강한다. 또 `isStandalone`(설치 여부) 헬퍼를 추가한다.

- [ ] **Step 1: 감지 함수 export + UA 보강**

`components/in-app-browser-gate.tsx`의 `detectInAppBrowser` 함수(8~18행)를 아래로 교체하고 `export`를 붙인다:

```tsx
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
  if (ua.includes("naver(inapp") || ua.includes("n
aver")) return "naver";
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
```

> 주의: `naver` 분기의 `"n
aver"` 줄바꿈은 오타다. 실제로는 한 줄 `if (ua.includes("naver(inapp") || ua.includes("naver")) return "naver";` 로 작성할 것.

- [ ] **Step 2: isIOS export + isStandalone 추가**

`isIOS` 함수(20~23행)에 `export`를 붙이고, 바로 아래에 추가:

```tsx
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
```

- [ ] **Step 3: APP_LABELS 보강 + 카피 개선**

`APP_LABELS`(37~43행)에 신규 환경 라벨 추가:

```tsx
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
```

차단 화면 제목·설명(67~74행)을 가입 친화 카피로 교체:

```tsx
        <h1 className="mt-4 text-xl font-bold text-foreground">
          {appName}에선 가입할 수 없어요
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          크롬 또는 사파리로 열면
          <br />1분이면 가입이 끝나요.
        </p>
```

- [ ] **Step 4: 검증**

Run: `pnpm run lint && npx tsc --noEmit`
Expected: 에러 없음. (`naver` 줄 오타를 반드시 한 줄로 수정했는지 확인)

- [ ] **Step 5: 커밋**

```bash
git add components/in-app-browser-gate.tsx
git commit -F - <<'EOF'
feat(auth): export in-app detection and broaden coverage

detectInAppBrowser·isIOS·isStandalone 를 export 해 PWA 프롬프트에서
재사용. 네이버·밴드·다음·iOS 비-Safari WebView 감지를 보강하고
차단 화면 카피를 가입 친화적으로 변경.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 3: PwaInstallPrompt 컴포넌트

**Files:**
- Create: `components/pwa-install-prompt.tsx`
- Create: `components/pwa-install-prompt.stories.tsx`

설치됨(standalone) 또는 인앱이면 렌더하지 않는다. Android/Chrome은 `beforeinstallprompt`를 캡처해 네이티브 설치를 띄우고, iOS Safari는 "공유 → 홈 화면에 추가" 안내를 보여준다. `banner`(전역 하단, 7일 dismiss) / `inline`(가입 완료 카드용) 두 모드.

- [ ] **Step 1: 컴포넌트 작성**

`components/pwa-install-prompt.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import {
  detectInAppBrowser,
  isIOS,
  isStandalone,
} from "@/components/in-app-browser-gate";
import { Body, Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    await deferred.userChoice;
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
```

- [ ] **Step 2: Story 작성**

`components/pwa-install-prompt.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

const meta = {
  title: "Common/PwaInstallPrompt",
  component: PwaInstallPrompt,
} satisfies Meta<typeof PwaInstallPrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

// 참고: standalone/인앱이 아닌 일반 브라우저 환경에서만 렌더됨.
export const Banner: Story = { args: { variant: "banner" } };
export const Inline: Story = { args: { variant: "inline" } };
```

- [ ] **Step 3: 검증**

Run: `pnpm run lint && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add components/pwa-install-prompt.tsx components/pwa-install-prompt.stories.tsx
git commit -F - <<'EOF'
feat(pwa): add home screen install prompt

standalone·인앱이 아닌 일반 브라우저에서만 노출. Android는
beforeinstallprompt 네이티브 설치, iOS는 공유→홈 화면 추가 안내.
banner(전역, 7일 dismiss)·inline(가입 완료) 두 모드.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 4: 전역 설치 배너 마운트 + iOS PWA 메타

**Files:**
- Modify: `app/(main)/layout.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: (main) 레이아웃에 배너 추가**

`app/(main)/layout.tsx`를 아래로 교체:

```tsx
import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { MemberProviderServer } from "@/components/member-provider-server";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <MemberProviderServer>
        <div className="min-h-svh bg-background">
          <main className="pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]">
            {children}
          </main>
          <PwaInstallPrompt variant="banner" />
          <BottomTabBar />
        </div>
      </MemberProviderServer>
    </Suspense>
  );
}
```

- [ ] **Step 2: 루트 메타에 iOS PWA 키 추가**

`app/layout.tsx`의 `viewport` export 아래(44행 뒤)에 추가:

```tsx
export const appleWebApp: Metadata["appleWebApp"] = {
  capable: true,
  statusBarStyle: "default",
  title: "기강",
};
```

그리고 `metadata` 객체에 `appleWebApp` 필드를 추가한다(기존 `metadata` 객체 안, `twitter` 다음에):

```tsx
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "기강",
  },
```

> 위 `export const appleWebApp` 별도 선언은 불필요하므로 넣지 말고, `metadata` 객체 안의 `appleWebApp` 필드만 추가할 것. (Next.js Metadata API가 `<meta name="apple-mobile-web-app-capable">` 등을 자동 생성)

- [ ] **Step 3: 검증**

Run: `pnpm run lint && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add "app/(main)/layout.tsx" app/layout.tsx
git commit -F - <<'EOF'
feat(pwa): mount global install banner and ios web-app meta

(main) 레이아웃 5개 탭 전역에 설치 배너 노출. 루트 metadata에
appleWebApp 추가해 iOS 홈 화면 설치 시 standalone 동작.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 5: /newbie 위저드 인트로 전면 재작성

**Files:**
- Modify: `app/(info)/newbie/page.tsx`

기존 데이터 상수(`rules`, `safetyRules`, `grades`, `runTypes`, `announcements` 등)는 **그대로 유지**하되, 화면 구성을 위저드 인트로로 바꾼다. 회칙·안전수칙·등급표·러닝팁은 "더 알아보기" 접이식 한 곳으로 모은다. 디자인 시스템(타이포 컴포넌트·색상 토큰·CardItem)을 적용한다.

- [ ] **Step 1: 페이지 재작성**

`app/(info)/newbie/page.tsx` 전체를 교체. 상단 import와 데이터 상수(`announcements`/`rules`/`safetyRules`/`grades`/`runTypes`)는 기존 그대로 두고, `activityChips`의 하드코딩 색은 제거(아래 참조). `Toggle` 컴포넌트와 페이지 본문을 아래로 교체:

```tsx
import Link from "next/link";
import { Check } from "lucide-react";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { SignupProgress } from "@/components/auth/signup-progress";
import { H1, H2, Body, Caption } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/* ─── 데이터 상수 (announcements/rules/safetyRules/grades/runTypes는 기존 유지) ─── */
// ... 기존 announcements, rules, safetyRules, grades, runTypes 상수 그대로 ...

/** 활동 칩 — 색상 토큰만 사용 */
const activityChips = [
  "🏃 러닝",
  "🚴 자전거",
  "🏊 수영",
  "⛰️ 등산",
  "🏅 대회",
  "🎉 외 활동 다수",
];

/** 가입 3단계 미리보기 */
const signupSteps = [
  { label: "카카오로 로그인", desc: "1초면 끝나요" },
  { label: "연락처 확인", desc: "기존 회원인지 확인해요" },
  { label: "기본 정보 입력", desc: "이름·성별·생일만요" },
];

/* ─── 더 알아보기 접이식 토글 ─── */
function Toggle({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="overflow-hidden rounded-xl border-[1.5px] border-border">
      <summary className="flex cursor-pointer items-center justify-between bg-secondary/50 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <Body className="font-bold">
          {icon} {title}
        </Body>
        <Caption className="transition-transform [[open]>&]:rotate-180">
          ▼
        </Caption>
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}

export default function NewbiePage() {
  return (
    <InAppBrowserGate>
      <SignupProgress step={1} />
      <div className="mx-auto max-w-md px-6 pb-28 pt-[calc(env(safe-area-inset-top,0px)+5rem)]">
        {/* 1. 히어로 */}
        <section className="text-center">
          <Caption className="tracking-[3px]">WELCOME TO</Caption>
          <H1 className="mt-2 text-[32px]">기강에 잘 오셨어요 👟</H1>
          <Body className="mt-3 block text-muted-foreground">
            3단계, 1분이면 가입이 끝나요.
          </Body>
        </section>

        {/* 2. 가입 3단계 미리보기 */}
        <section className="mt-8 flex flex-col gap-2.5">
          {signupSteps.map((s, i) => (
            <CardItem key={s.label} className="flex items-center gap-3 p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {i + 1}
              </span>
              <div className="flex flex-col">
                <Body className="font-semibold">{s.label}</Body>
                <Caption>{s.desc}</Caption>
              </div>
            </CardItem>
          ))}
        </section>

        {/* 3. 준비물 */}
        <CardItem className="mt-4 flex items-center gap-3 bg-secondary/40 p-4">
          <Check className="size-5 shrink-0 text-success" />
          <Body className="text-muted-foreground">
            <span className="font-semibold text-foreground">연락처</span>만
            있으면 바로 시작할 수 있어요.
          </Body>
        </CardItem>

        {/* 4. 활동 소개 */}
        <section className="mt-8">
          <H2 className="text-base">✨ 이런 활동을 해요</H2>
          <div className="mt-3 flex flex-wrap gap-2">
            {activityChips.map((c) => (
              <span
                key={c}
                className="rounded-full bg-secondary px-3.5 py-1.5 text-[13px] font-semibold text-secondary-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        </section>

        {/* 5. 더 알아보기 (기존 정보 보존) */}
        <section className="mt-8">
          <Caption className="font-semibold text-foreground">
            ▸ 기강이 더 궁금하다면
          </Caption>
          <div className="mt-3 flex flex-col gap-2">
            <Toggle icon={announcements.icon} title={announcements.title}>
              {announcements.sections.map((s) => (
                <div key={s.heading} className="mb-3 last:mb-0">
                  <Body className="mb-1 block text-[13px] font-bold">
                    {s.heading}
                  </Body>
                  <ul className="list-disc pl-4 text-[13px] text-muted-foreground">
                    {s.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <Caption className="mt-2 block">{announcements.footer}</Caption>
            </Toggle>

            <Toggle icon="📜" title="회칙">
              <ul className="space-y-1.5 text-[13px] text-muted-foreground">
                {rules.map((r) => (
                  <li key={r.label}>
                    <span className="font-bold text-foreground">{r.label}</span>{" "}
                    — {r.desc}
                  </li>
                ))}
              </ul>
            </Toggle>

            <Toggle icon="🦺" title="러닝크루 안전수칙">
              <ul className="space-y-1.5 text-[13px] text-muted-foreground">
                {safetyRules.map((r) => (
                  <li key={r.label}>
                    <span className="font-bold text-foreground">{r.label}</span>{" "}
                    — {r.desc}
                  </li>
                ))}
              </ul>
            </Toggle>

            <Toggle icon="💡" title="러닝팁 (등급·페이스·러닝화)">
              <Body className="mb-1.5 block text-[13px] font-bold">
                🏅 등급표
              </Body>
              <table className="mb-4 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-secondary/70">
                    <th className="border border-border px-2 py-1.5 text-left font-semibold">
                      등급
                    </th>
                    <th className="border border-border px-2 py-1.5 text-left font-semibold">
                      기준
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map((g) => (
                    <tr key={g.grade}>
                      <td className="border border-border px-2 py-1.5">
                        {g.grade}
                      </td>
                      <td className="border border-border px-2 py-1.5">
                        {g.criteria}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Body className="mb-1.5 block text-[13px] font-bold">
                🏃 러닝의 종류
              </Body>
              <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted-foreground">
                {runTypes.map((t) => (
                  <li key={t.name}>
                    <span className="font-bold text-foreground">{t.name}</span>{" "}
                    — {t.desc}
                  </li>
                ))}
              </ul>
            </Toggle>
          </div>
        </section>

        {/* 6. 하단 고정 CTA */}
        <div className="fixed inset-x-0 bottom-0 z-50 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-4 pt-6">
          <div className="mx-auto max-w-md">
            <Button asChild size="lg" className="w-full rounded-2xl font-bold">
              <Link href="/auth/login?next=%2Fonboarding">시작하기 →</Link>
            </Button>
            <Caption className="mt-2 block text-center">
              카카오 또는 구글로 간편 가입
            </Caption>
          </div>
        </div>
      </div>
    </InAppBrowserGate>
  );
}
```

> 채널 바로가기(카카오/인스타)·문의 섹션은 가입 흐름 집중을 위해 제거한다. 인스타 링크는 로그인 폼의 `SocialLinksRow`에 이미 존재하므로 손실 없음.

- [ ] **Step 2: 검증**

Run: `pnpm run lint && pnpm run build`
Expected: 빌드 성공. `/newbie` 라우트 정상 컴파일

- [ ] **Step 3: 커밋**

```bash
git add "app/(info)/newbie/page.tsx"
git commit -F - <<'EOF'
feat(newbie): rebuild as 3-step signup wizard intro

정보 덤프형 랜딩을 가입 집중형 위저드 인트로로 재작성.
진행바(1/3)·가입 3단계 미리보기·준비물 안내 추가, 회칙·안전수칙·
등급표·러닝팁은 "더 알아보기" 접이식으로 보존. 디자인 시스템
(타이포 컴포넌트·색상 토큰·CardItem) 전면 적용.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 6: /auth/login 진행바(2/3) + 인앱 차단

**Files:**
- Modify: `app/auth/login/page.tsx`

- [ ] **Step 1: 페이지에 진행바 + InAppBrowserGate 추가**

`app/auth/login/page.tsx`를 아래로 교체:

```tsx
import { LoginForm } from "@/components/auth/login-form";
import { Suspense } from "react";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { SignupProgress } from "@/components/auth/signup-progress";

export default function Page() {
  return (
    <InAppBrowserGate>
      <SignupProgress step={2} />
      <Suspense
        fallback={
          <div className="flex min-h-svh w-full items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </InAppBrowserGate>
  );
}
```

> auth layout이 `min-h-svh items-center justify-center`로 폼을 세로 중앙 배치하므로, 상단 고정 진행바와 겹치지 않는다.

- [ ] **Step 2: 검증**

Run: `pnpm run lint && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/auth/login/page.tsx
git commit -F - <<'EOF'
feat(auth): add wizard progress and in-app gate to login

로그인 페이지에 진행바(2/3) 추가, InAppBrowserGate로 래핑해
인앱 브라우저 OAuth 좌절을 차단.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 7: /onboarding 인앱 차단 + 이름 prefill 전달

**Files:**
- Modify: `app/(protected)/onboarding/page.tsx`

- [ ] **Step 1: InAppBrowserGate 래핑 + initialFullName 추출**

`app/(protected)/onboarding/page.tsx`의 `OnboardingContent` 함수에서 `initialAvatarUrl` 추출부(33~37행) 다음에 이름 후보를 추출하고, `MemberOnboardingForm` 호출을 수정한다.

import에 추가:

```tsx
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
```

`initialAvatarUrl` 다음에 추가:

```tsx
  // OAuth 이름 후보 추출 — 한글 2~5자만 prefill(검증 통과 값), 그 외는 빈 값
  const rawName =
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    "";
  const initialFullName = /^[가-힣]{2,5}$/.test(rawName.trim())
    ? rawName.trim()
    : "";
```

`return` 문을 `InAppBrowserGate`로 감싸고 `initialFullName` prop 추가:

```tsx
  return (
    <InAppBrowserGate>
      <div className="flex min-h-svh w-full items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm">
          <MemberOnboardingForm
            userId={user.id}
            provider={user.app_metadata?.provider as "kakao" | "google"}
            email={user.email}
            initialAvatarUrl={initialAvatarUrl}
            initialFullName={initialFullName}
            kakaoChatPassword={env.KAKAO_CHAT_PASSWORD ?? ""}
          />
        </div>
      </div>
    </InAppBrowserGate>
  );
```

- [ ] **Step 2: 검증**

Run: `pnpm run lint && npx tsc --noEmit`
Expected: `MemberOnboardingForm`에 `initialFullName` prop이 아직 없어 타입 에러 발생 → Task 8에서 추가하므로, 이 태스크는 Task 8과 함께 검증/커밋한다.

- [ ] **Step 3: (Task 8 완료 후 함께 커밋)**

이 변경은 Task 8의 폼 변경과 타입이 맞물리므로 Task 8 Step 4에서 함께 커밋한다.

---

## Task 8: member-onboarding-form 진행바 + 폼 간소화 + prefill + 완료 설치 CTA

**Files:**
- Modify: `components/auth/member-onboarding-form.tsx`

가입 필수를 이름·성별·생일로 줄이고, 은행·계좌는 접이식 "선택" 섹션으로 내린다(미입력 시 서버가 nullable로 수용). 진행바(3/3, 완료 시 done)와 이름 prefill, 완료 화면 설치 CTA·계좌 나중에 링크를 추가한다. **서버 액션 호출 페이로드 구조와 검증 규칙은 변경하지 않는다.**

- [ ] **Step 1: import·props·타입 추가**

import 블록에 추가:

```tsx
import { SignupProgress } from "@/components/auth/signup-progress";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
```

`MemberOnboardingFormProps` 타입에 `initialFullName` 추가:

```tsx
type MemberOnboardingFormProps = {
  userId: string;
  provider: "kakao" | "google";
  email?: string | null;
  initialAvatarUrl?: string | null;
  initialFullName?: string;
  kakaoChatPassword?: string;
};
```

함수 시그니처 구조분해에 `initialFullName = ""` 추가:

```tsx
export function MemberOnboardingForm({
  userId: _userId,
  provider,
  email,
  initialAvatarUrl,
  initialFullName = "",
  kakaoChatPassword,
}: MemberOnboardingFormProps) {
```

`useForm` defaultValues의 `fullName: ""`을 `fullName: initialFullName`으로 변경.

- [ ] **Step 2: 완료(success) 화면에 진행바 + 설치 CTA + 계좌 나중에 링크**

`if (stage === "success")` 블록의 반환 JSX에서, 최상위 `<div className="flex flex-col gap-6">` 바로 안 첫 줄에 `<SignupProgress step={3} done />`를 추가하고(Confetti 앞), `<div className="flex w-full flex-col gap-2.5">`(오픈채팅·홈으로 버튼 묶음) 안의 "홈으로 이동" `<Link>` **앞에** 설치 CTA를 추가한다:

```tsx
              <div className="w-full">
                <p className="mb-2 text-center text-sm font-semibold text-foreground">
                  마지막! 홈 화면에 추가하면 앱처럼 빨라요
                </p>
                <PwaInstallPrompt variant="inline" />
              </div>
```

그리고 "홈으로 이동" 링크 다음에 계좌 나중에 링크 추가:

```tsx
                <Link
                  href="/profile/bank"
                  className="text-center text-xs font-medium text-muted-foreground underline"
                >
                  계좌는 나중에 등록할게요
                </Link>
```

- [ ] **Step 3: details stage 폼 간소화 — 은행·계좌·이메일을 접이식으로**

`stage`가 details일 때 렌더되는 블록(`<>` 안의 email/fullName/gender/birthday/phone/bankName/bankAccount 필드들)을 재구성한다:

1. 상단에 진행바: details/phone/pending 모든 stage를 감싸는 최상위 `return`의 `<div className={cn("flex flex-col gap-6")}>` 첫 줄에 `<SignupProgress step={3} />` 추가.
2. **필수 필드(이름·성별·생일)는 그대로 노출.** 단 `email` input(327~351행)과 `bankName`·`bankNameCustom`·`bankAccount` 필드(439~512행)를 아래 접이식 `<details>` 안으로 이동:

```tsx
                      <details className="rounded-xl border-[1.5px] border-border">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                          + 추가 정보 (선택 · 나중에 입력 가능)
                        </summary>
                        <div className="flex flex-col gap-6 border-t border-border px-4 py-4">
                          {/* 기존 email FormField (email 없을 때만) */}
                          {/* 기존 bankName FormField */}
                          {/* 기존 bankNameCustom FormField (custom 선택 시) */}
                          {/* 기존 bankAccount FormField */}
                        </div>
                      </details>
```

   `phone`(연락처) disabled 필드는 필수 그룹에 유지. `fullName`·`gender`·`birthday`는 접이식 밖 그대로.
3. 제출 버튼 라벨을 "저장하고 계속하기" → "가입 완료"로 변경. "번호 다시 입력" ghost 버튼은 유지.

> 검증 규칙은 변경 금지: `onSubmit`은 이미 이름·성별·생일·phone만 필수 검증하고 은행/계좌는 빈 값을 nullable로 보낸다. 접이식을 펼치지 않으면 자연히 계좌 없이 가입된다.

- [ ] **Step 4: 검증 + 커밋 (Task 7과 함께)**

Run: `pnpm run lint && pnpm run build`
Expected: 빌드 성공. `initialFullName` 타입 정합. `/onboarding` 정상 컴파일

```bash
git add components/auth/member-onboarding-form.tsx "app/(protected)/onboarding/page.tsx"
git commit -F - <<'EOF'
feat(onboarding): simplify form and add wizard progress

가입 필수를 이름·성별·생일로 축소, 은행·계좌·이메일은 "추가 정보"
접이식으로 이동(미입력 시 nullable). 진행바(3/3)·OAuth 이름 prefill·
완료 화면 PWA 설치 CTA·"계좌 나중에" 링크 추가. 서버 액션 페이로드와
검증 규칙은 불변.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 9: 전체 흐름 검증 + 문서 후처리

**Files:**
- Modify: `DESIGN.md`, `.claude/docs/component-conventions.md`, `AGENTS.md`(필요 시)

- [ ] **Step 1: 전체 빌드 + 린트 최종 확인**

Run: `pnpm run lint && pnpm run build`
Expected: 전체 성공

- [ ] **Step 2: DESIGN.md 컴포넌트 카탈로그 갱신**

`components/common/` 또는 `auth/` 신규 컴포넌트 규약 추가:
- `SignupProgress` (`auth/signup-progress.tsx`) — props `step`, `done?`, 용도: 가입 위저드 진행바
- `PwaInstallPrompt` (`pwa-install-prompt.tsx`) — props `variant`, 용도: 홈 화면 설치 유도

- [ ] **Step 3: component-conventions.md 갱신**

`in-app-browser-gate.tsx` 항목에 export된 헬퍼(`detectInAppBrowser`/`isIOS`/`isStandalone`)와 가입 흐름 전체 적용 사실 추가. `PwaInstallPrompt`·`SignupProgress` 항목 추가.

- [ ] **Step 4: 커밋**

```bash
git add DESIGN.md .claude/docs/component-conventions.md
git commit -F - <<'EOF'
docs(design): document signup wizard and pwa components

SignupProgress·PwaInstallPrompt 규약과 InAppBrowserGate export
헬퍼를 디자인/컴포넌트 문서에 반영.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Self-Review 결과

**1. Spec coverage:**
- 3단계 위저드 진행바 → Task 1 ✓
- `/newbie` 재작성 + 정보 "더 알아보기" 보존 → Task 5 ✓
- login/onboarding 진행바 통일 → Task 6, 7, 8 ✓
- 인앱 차단 전체 적용 + UA 보강 → Task 2, 5(유지), 6, 7 ✓
- PWA 설치(완료 화면 + 전역 배너) → Task 3, 4, 8 ✓
- 폼 간소화(계좌 나중에) + OAuth 이름 prefill → Task 7, 8 ✓
- 디자인 시스템 적용 → Task 5, 8 ✓
- iOS 메타 → Task 4 ✓
- 서버 액션·검증·OAuth·manifest 불변 → 명시 ✓

**2. Placeholder scan:** Task 5의 "기존 상수 그대로"는 실제 파일에 이미 존재하는 코드 재사용 지시(의도적). Task 8 Step 3의 주석 플레이스홀더는 "기존 FormField 이동"이라는 명확한 이동 대상 지정. 그 외 TBD/TODO 없음.

**3. Type consistency:** `SignupProgress({step, done})`, `PwaInstallPrompt({variant})`, `detectInAppBrowser()`/`isIOS()`/`isStandalone()`, `MemberOnboardingForm`의 `initialFullName` — 정의(Task 1·2·3·8)와 사용처(Task 4·5·6·7·8) 시그니처 일치 확인.

**주의 사항:** Task 7은 단독으로 타입 에러(initialFullName 미정의)가 나므로 Task 8과 묶어 검증·커밋한다(계획에 명시).
