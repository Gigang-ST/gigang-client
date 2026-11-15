import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamCfg } from "@/lib/team-cfg/read";
import { Caption } from "@/components/common/typography";

export default async function DuesAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await verifyAdmin();
  if (!admin) redirect("/");
  // 회비를 안 쓰는 팀(팀 설정 feature.dues)은 회비 관리 화면 전체가 없다 — 하위 화면을 이 레이아웃 하나가 막는다
  const { teamId } = await getRequestTeamContext();
  if (!(await getTeamCfg(teamId, "feature.dues"))) notFound();

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
