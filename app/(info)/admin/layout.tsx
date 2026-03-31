import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, member } = await getCurrentMember();

  if (!user) redirect("/auth/login");
  if (!member?.admin) redirect("/");

  return <>{children}</>;
}
