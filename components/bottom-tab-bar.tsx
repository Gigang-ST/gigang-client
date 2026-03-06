"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Trophy, Medal, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "홈", href: "/", icon: House },
  { label: "대회", href: "/races", icon: Trophy },
  { label: "랭킹", href: "/records", icon: Medal },
  { label: "프로필", href: "/profile", icon: User },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex h-14 items-center justify-around">
        {TABS.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
