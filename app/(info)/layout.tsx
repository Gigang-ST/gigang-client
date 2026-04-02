import { BackHeader } from "@/components/back-header";
import { MemberProvider } from "@/contexts/member-context";
import { getMember } from "@/lib/get-member";

export default async function InfoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getMember();

  return (
    <MemberProvider member={member}>
      <div className="min-h-svh bg-white">
        <BackHeader />
        <main>{children}</main>
      </div>
    </MemberProvider>
  );
}
