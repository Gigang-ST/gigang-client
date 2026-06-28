import { Suspense } from "react";

import { BottomTabBar } from "@/components/bottom-tab-bar";
import { PushPermissionPromptGate } from "@/components/push-permission-prompt-gate";
import { Skeleton } from "@/components/ui/skeleton";

function AppShellFallback() {
  return (
    <div className="min-h-svh bg-background">
      <main className="pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]">
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
        <main className="pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]">
          {children}
        </main>
        <Suspense fallback={null}>
          <PushPermissionPromptGate />
        </Suspense>
      </Suspense>
      <BottomTabBar />
    </div>
  );
}
