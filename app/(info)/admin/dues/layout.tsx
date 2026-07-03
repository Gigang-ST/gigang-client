import { redirect } from "next/navigation";
import Link from "next/link";

import { verifyAdmin } from "@/lib/queries/member";
import { Caption } from "@/components/common/typography";

export default async function DuesAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await verifyAdmin();
  if (!admin) redirect("/");

  return (
    <div className="flex flex-col gap-0">
      <nav className="flex gap-4 border-b border-border px-6 py-3">
        <Link href="/admin/dues">
          <Caption className="text-foreground">📒 잔액 원장</Caption>
        </Link>
        <Link href="/admin/dues/inbox">
          <Caption className="text-foreground">📥 처리</Caption>
        </Link>
        <Link href="/admin/dues/projects">
          <Caption className="text-foreground">🎯 프로젝트</Caption>
        </Link>
      </nav>
      {children}
    </div>
  );
}
