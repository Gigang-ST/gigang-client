import { BottomTabBar } from "@/components/bottom-tab-bar";
import { MemberProvider } from "@/contexts/member-context";
import { getMember } from "@/lib/get-member";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { member } = await getMember();

  return (
    <MemberProvider member={member}>
      <div className="min-h-svh bg-white">
        <main className="pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]">
          {children}
        </main>
        <BottomTabBar />
      </div>
    </MemberProvider>
  );
}
