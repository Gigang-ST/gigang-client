"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserCheck, Users, Trophy, Timer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { H2 } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { getAdminStats, type AdminStats } from "@/app/actions/admin/get-stats";

const cards = [
  {
    key: "approvals",
    label: "가입 승인 대기",
    href: "/admin/approvals",
    icon: UserCheck,
    getValue: (s: AdminStats) => s.pendingCount,
    accent: true,
  },
  {
    key: "members",
    label: "활성 회원",
    href: "/admin/members",
    icon: Users,
    getValue: (s: AdminStats) => `${s.activeCount} / ${s.totalCount}`,
    accent: false,
  },
  {
    key: "competitions",
    label: "이번 달 대회",
    href: "/admin/competitions",
    icon: Trophy,
    getValue: (s: AdminStats) => s.monthlyCompetitionCount,
    accent: false,
  },
  {
    key: "records",
    label: "전체 기록",
    href: "/admin/records",
    icon: Timer,
    getValue: (s: AdminStats) => s.recentRecordCount,
    accent: false,
  },
] as const;

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    getAdminStats().then(setStats);
  }, []);

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
      <H2>관리</H2>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <CardItem asChild key={card.key} className="flex flex-col gap-3">
            <Link
              href={card.href}
              className="transition-colors active:bg-secondary"
            >
            <div className="flex items-center gap-2">
              <card.icon className="size-4 text-muted-foreground" />
              <span className="text-[13px] font-medium text-muted-foreground">
                {card.label}
              </span>
            </div>
            {stats ? (
              <span
                className={`text-2xl font-bold ${
                  card.accent && stats.pendingCount > 0
                    ? "text-destructive"
                    : "text-foreground"
                }`}
              >
                {card.getValue(stats)}
              </span>
            ) : (
              <Skeleton className="h-8 w-12 rounded" />
            )}
            </Link>
          </CardItem>
        ))}
      </div>
    </div>
  );
}
