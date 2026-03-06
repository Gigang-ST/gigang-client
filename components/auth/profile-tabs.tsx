"use client";

import { useState, type ReactNode } from "react";

type Tab = "profile" | "pb" | "utmb";

const TABS: { value: Tab; label: string }[] = [
  { value: "profile", label: "프로필" },
  { value: "pb", label: "최고기록" },
  { value: "utmb", label: "UTMB" },
];

export function ProfileTabs({
  profileTab,
  pbTab,
  utmbTab,
}: {
  profileTab: ReactNode;
  pbTab: ReactNode;
  utmbTab: ReactNode;
}) {
  const [active, setActive] = useState<Tab>("profile");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActive(tab.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              active === tab.value
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active === "profile" && profileTab}
      {active === "pb" && pbTab}
      {active === "utmb" && utmbTab}
    </div>
  );
}
