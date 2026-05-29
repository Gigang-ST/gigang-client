"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "titles" | "effects";

export function AdminTitlesPageClient({
  titlesContent,
  effectsContent,
}: {
  titlesContent: React.ReactNode;
  effectsContent: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("titles");

  return (
    <div className="flex flex-col gap-0">
      {/* 탭 헤더 */}
      <div className="flex gap-1 border-b border-border px-6 pt-4">
        {([
          { key: "titles",  label: "칭호 관리" },
          { key: "effects", label: "이펙트 관리" },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "pb-2 pr-4 text-sm font-medium transition-colors",
              tab === key
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={tab === "titles" ? "block" : "hidden"}>
        {titlesContent}
      </div>
      <div className={tab === "effects" ? "block" : "hidden"}>
        {effectsContent}
      </div>
    </div>
  );
}
