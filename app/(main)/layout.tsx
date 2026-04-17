import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { MemberProviderServer } from "@/components/member-provider-server";
import { getCurrentMember } from "@/lib/queries/member";

async function MainLayoutWithOnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "/";
  const safeNext =
    pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";

  const { user, member } = await getCurrentMember();
  if (user && !member) {
    redirect(`/onboarding?next=${encodeURIComponent(safeNext)}`);
  }

  return (
    <MemberProviderServer>
      <div className="min-h-svh bg-white">
        <main className="pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]">
          {children}
        </main>
        <BottomTabBar />
      </div>
    </MemberProviderServer>
  );
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <MainLayoutWithOnboardingGate>{children}</MainLayoutWithOnboardingGate>
    </Suspense>
  );
}
