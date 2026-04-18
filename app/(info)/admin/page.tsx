"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Trophy,
  Timer,
  Sparkles,
  FolderKanban,
  HandCoins,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { H2, SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
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
  getAccentValue?: (s: AdminStats) => number;
};

const generalCards: Card[] = [
  {
    key: "members",
    label: "회원 관리",
    href: "/admin/members",
    icon: Users,
    getValue: (s) => s.totalCount,
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
    label: "승인 대기 참여자",
    href: "/admin/participations",
    icon: HandCoins,
    getValue: (s) => s.pendingParticipationCount,
    getAccentValue: (s) => s.pendingParticipationCount,
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

type FetchStatus = "loading" | "success" | "error";

function CardGrid({
  cards,
  stats,
  status,
}: {
  cards: Card[];
  stats: AdminStats | null;
  status: FetchStatus;
}) {
  return (
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
            {status === "loading" && (
              <Skeleton className="h-8 w-12 rounded" />
            )}
            {status === "error" && (
              <span className="text-sm text-destructive">불러오기 실패</span>
            )}
            {status === "success" && stats && (
              <span
                className={`text-2xl font-bold ${
                  card.getAccentValue && card.getAccentValue(stats) > 0
                    ? "text-destructive"
                    : "text-foreground"
                }`}
              >
                {card.getValue(stats)}
              </span>
            )}
          </Link>
        </CardItem>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");

  useEffect(() => {
    getAdminStats()
      .then((data) => {
        setStats(data);
        setStatus("success");
      })
      .catch(() => {
        setStatus("error");
      });
  }, []);

  return (
    <div className="flex flex-col gap-8 px-6 pb-6 pt-4">
      <H2>관리</H2>

      <section className="flex flex-col gap-3">
        <SectionLabel>일반</SectionLabel>
        <CardGrid cards={generalCards} stats={stats} status={status} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>프로젝트</SectionLabel>
        <CardGrid cards={projectCards} stats={stats} status={status} />
      </section>
    </div>
  );
}
