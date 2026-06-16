"use client";

import { useState } from "react";

import { IdCard, Sparkles } from "lucide-react";

import type { MemberCardData } from "@/lib/member-card";
import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { CollectionSheet } from "@/components/profile/collection-sheet";
import { MyRecordCardDialog } from "@/components/profile/my-record-card";
import { CardItem } from "@/components/ui/card";

export function ProfileCard({
  fullName,
  avatarUrl,
  joinedDate,
  teamMemId,
  teamId,
  primaryTtlId,
  primaryTtlNm,
  primaryTtlDesc,
  primaryTtlDescVisibility,
  selectedBadgeEffect,
  selectedFrameCd,
  maxRarityLevel,
  memberCard,
}: {
  fullName: string;
  avatarUrl: string | null;
  genderLabel: string;
  joinedDate: string;
  teamMemId: string;
  teamId: string;
  primaryTtlId: string | null;
  primaryTtlNm: string | null;
  primaryTtlDesc: string | null;
  primaryTtlDescVisibility: "always" | "others" | "held" | "never";
  selectedBadgeEffect: string | null;
  selectedFrameCd: string | null;
  maxRarityLevel: number;
  memberCard?: MemberCardData | null;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
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
                tooltip={{ desc: primaryTtlDesc, visibility: primaryTtlDescVisibility, isHeld: true, isOwner: true }}
              />
            )}
          </div>
          {joinedDate && (
            <span className="text-xs text-muted-foreground">{joinedDate} 가입</span>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {memberCard && (
            <button
              onClick={() => setCardOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              <IdCard className="size-3.5" />
              내 카드
            </button>
          )}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <Sparkles className="size-3.5" />
            내 컬렉션
          </button>
        </div>
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

      {memberCard && (
        <MyRecordCardDialog
          initialData={memberCard}
          open={cardOpen}
          onOpenChange={setCardOpen}
        />
      )}
    </>
  );
}
