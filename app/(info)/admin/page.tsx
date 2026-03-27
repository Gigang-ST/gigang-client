"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  UserCheck,
  Users,
  Trophy,
  Timer,
  Sparkles,
  FolderKanban,
  HandCoins,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAdminStats,
  type AdminStats,
} from "@/app/actions/admin/get-admin-stats";

type Card = {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  getValue: (s: AdminStats) => string | number;
  accent?: boolean;
};

const generalCards: Card[] = [
  {
    key: "approvals",
    label: "가입 승인 대기",
    href: "/admin/approvals",
    icon: UserCheck,
    getValue: (s) => s.pendingCount,
    accent: true,
  },
  {
    key: "members",
    label: "활성 회원",
    href: "/admin/members",
    icon: Users,
    getValue: (s) => `${s.activeCount} / ${s.totalCount}`,
  },
  {
    key: "competitions",
    label: "이번 달 대회",
    href: "/admin/competitions",
    icon: Trophy,
    getValue: (s) => s.monthlyCompetitionCount,
  },
  {
    key: "records",
    label: "전체 기록",
    href: "/admin/records",
    icon: Timer,
    getValue: (s) => s.recentRecordCount,
  },
];

const projectCards: Card[] = [
  {
    key: "participations",
    label: "참여자 관리",
    href: "/admin/participations",
    icon: HandCoins,
    getValue: (s) => `대기${s.pendingParticipationCount} / 참여${s.confirmedParticipationCount}`,
  },
  {
    key: "projects",
    label: "활성 프로젝트",
    href: "/admin/projects",
    icon: FolderKanban,
    getValue: (s) => s.activeProjectCount,
  },
  {
    key: "events",
    label: "활성 이벤트",
    href: "/admin/events",
    icon: Sparkles,
    getValue: (s) => s.activeEventCount,
  },
];

function CardGrid({
  cards,
  stats,
}: {
  cards: Card[];
  stats: AdminStats | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <Link
          key={card.key}
          href={card.href}
          className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-border p-4 transition-colors active:bg-secondary"
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
                card.accent && Number(card.getValue(stats)) > 0
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
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    getAdminStats().then(setStats);
  }, []);

  return (
    <div className="flex flex-col gap-8 px-6 pb-6 pt-4">
      <h1 className="text-[22px] font-bold tracking-tight text-foreground">
        관리
      </h1>

      <section className="flex flex-col gap-3">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground">
          일반
        </span>
        <CardGrid cards={generalCards} stats={stats} />
      </section>

      <section className="flex flex-col gap-3">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground">
          프로젝트
        </span>
        <CardGrid cards={projectCards} stats={stats} />
      </section>
    </div>
  );
}
