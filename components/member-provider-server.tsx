import { getCurrentMember } from "@/lib/queries/member";
import { MemberProvider } from "@/contexts/member-context";

export async function MemberProviderServer({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, member } = await getCurrentMember();

  return (
    <MemberProvider userId={user?.id ?? null} member={member}>
      {children}
    </MemberProvider>
  );
}
