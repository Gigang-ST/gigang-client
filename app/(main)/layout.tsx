import { Suspense } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { MemberProviderServer } from "@/components/member-provider-server";

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
          <BottomTabBar />
        </div>
      </MemberProviderServer>
    </Suspense>
  );
}
