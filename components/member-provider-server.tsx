import { getMember } from "@/lib/get-member";
import { MemberProvider } from "@/contexts/member-context";

export async function MemberProviderServer({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, member } = await getMember();

  return (
    <MemberProvider userId={userId} member={member}>
      {children}
    </MemberProvider>
  );
}
