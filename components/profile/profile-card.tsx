"use client";

import { useState } from "react";

import { Sparkles } from "lucide-react";

import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { CollectionSheet } from "@/components/profile/collection-sheet";
import { CardItem } from "@/components/ui/card";

export function ProfileCard({
  fullName,
  avatarUrl,
  genderLabel,
  joinedDate,
  teamMemId,
  teamId,
  primaryTtlId,
  primaryTtlNm,
  selectedBadgeEffect,
  selectedFrameCd,
  maxRarityLevel,
}: {
  fullName: string;
  avatarUrl: string | null;
  genderLabel: string;
  joinedDate: string;
  teamMemId: string;
  teamId: string;
  primaryTtlId: string | null;
  primaryTtlNm: string | null;
  selectedBadgeEffect: string | null;
  selectedFrameCd: string | null;
  maxRarityLevel: number;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const frameCls = getFrameCls(selectedFrameCd);

  return (
    <>
      <CardItem className={cn("flex items-center gap-4 p-5", frameCls)}>
        <Avatar src={avatarUrl} alt={fullName} size="xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-bold text-foreground">{fullName}</span>
            {primaryTtlNm && (
              <TitleBadge
                name={primaryTtlNm}
                effect={selectedBadgeEffect ?? "none"}
                size="sm"
              />
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {genderLabel}{joinedDate ? ` · ${joinedDate} 가입` : ""}
          </span>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <Sparkles className="size-3.5" />
          내 컬렉션
        </button>
      </CardItem>

      <CollectionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        teamMemId={teamMemId}
        teamId={teamId}
        currentPrimaryTtlId={primaryTtlId}
        currentBadgeEffect={selectedBadgeEffect}
        currentFrameCd={selectedFrameCd}
        maxRarityLevel={maxRarityLevel}
        memberName={fullName}
      />
    </>
  );
}
