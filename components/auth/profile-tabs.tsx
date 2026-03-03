"use client";

import { useState, type ReactNode } from "react";

type Tab = "profile" | "pb";

const TABS: { value: Tab; label: string }[] = [
  { value: "profile", label: "프로필" },
  { value: "pb", label: "최고기록" },
];

export function ProfileTabs({
  profileTab,
  pbTab,
}: {
  profileTab: ReactNode;
  pbTab: ReactNode;
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
                ? "bg-white text-foreground shadow-sm"
                : "text-white/70 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active === "profile" ? profileTab : pbTab}
    </div>
  );
}
