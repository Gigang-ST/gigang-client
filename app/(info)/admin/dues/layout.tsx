import { redirect } from "next/navigation";
import { verifyAdmin } from "@/lib/queries/member";

export default async function DuesAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await verifyAdmin();
  if (!admin) redirect("/");
  return <>{children}</>;
}
