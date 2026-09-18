import { Suspense } from "react";

import { BottomTabBar } from "@/components/bottom-tab-bar";
import { PresenceFloor } from "@/components/presence/presence-floor";
import { PushPermissionPromptGate } from "@/components/push-permission-prompt-gate";
import { Skeleton } from "@/components/ui/skeleton";

function AppShellFallback() {
  return (
    <div className="min-h-svh bg-background">
      <main className="pb-[var(--tabbar-h)]">
        <div className="h-14" />
        <div className="flex flex-col gap-7 px-6">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-3 w-20" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
          </div>
        </div>
      </main>
      <BottomTabBar />
    </div>
  );
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background">
      <Suspense fallback={<AppShellFallback />}>
        <main className="pb-[var(--tabbar-h)]">
          {children}
        </main>
        <Suspense fallback={null}>
          <PushPermissionPromptGate />
        </Suspense>
      </Suspense>
      <BottomTabBar />
      {/* 탭바가 있는 화면임을 전역 접속자 레이어에 알린다 — 아무것도 그리지 않는다.
          레이어는 `<body>` 직계라 자기가 어느 라우트 그룹에 있는지 모른다(§presence-floor). */}
      <PresenceFloor />
    </div>
  );
}
