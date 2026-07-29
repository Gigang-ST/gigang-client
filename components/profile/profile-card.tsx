"use client";

import { useState } from "react";

import { Pencil, Sparkles } from "lucide-react";

import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { IntroEditDialog } from "@/components/members/intro-edit-dialog";
import { MemberCardDialog } from "@/components/members/member-card-dialog";
import { CollectionSheet } from "@/components/profile/collection-sheet";
import { CardItem } from "@/components/ui/card";

export function ProfileCard({
  fullName,
  avatarUrl,
  memId,
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
  introTxt,
}: {
  fullName: string;
  avatarUrl: string | null;
  /** 멤버 고유 id — 폴백 아바타 seed. 다른 화면(댓글·모임)과 동일하게 mem_id로 통일 */
  memId: string;
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
  /** 한마디 — 미설정이면 편집 유도 문구를 보여준다 */
  introTxt?: string | null;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  // 저장 직후 router.refresh()가 돌기 전에도 바뀐 값이 보이도록 낙관적으로 덮어쓴다.
  const [intro, setIntro] = useState(introTxt ?? "");
  const frameCls = getFrameCls(selectedFrameCd);

  return (
    <>
      {/* 카드 본문 탭 → 내 프로필 카드(랭킹에서 남을 눌렀을 때와 같은 화면) */}
      <CardItem
        role="button"
        tabIndex={0}
        onClick={() => setCardOpen(true)}
        onKeyDown={(e) => {
          // 중첩 버튼(한마디 수정·내 컬렉션·칭호 툴팁)에 포커스가 있을 때의 Enter/Space는
          // 그 버튼이 처리하도록 두고, 카드 루트 자신에서 난 키만 카드 다이얼로그를 연다.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCardOpen(true);
          }
        }}
        aria-label="내 프로필 카드 보기"
        className={cn(
          "flex cursor-pointer items-center gap-4 p-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          frameCls,
        )}
      >
        <Avatar src={avatarUrl} seed={memId} alt={fullName} size="xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-bold text-foreground">{fullName}</span>
            {primaryTtlNm && (
              <TitleBadge
                name={primaryTtlNm}
                effect={selectedBadgeEffect ?? "none"}
                size="sm"
                tooltip={{ desc: primaryTtlDesc, visibility: primaryTtlDescVisibility, isHeld: true  }}
              />
            )}
          </div>
          {/* 한마디 — 연필을 누르면 이 자리에서 바로 수정(프로필 수정 화면으로 이동하지 않는다) */}
          <div className="flex min-w-0 items-center gap-1">
            <span
              className={cn(
                "min-w-0 truncate text-[13px]",
                intro ? "text-foreground/80" : "text-muted-foreground",
              )}
            >
              {intro || "한마디 남기기"}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIntroOpen(true);
              }}
              aria-label="한마디 수정"
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Pencil className="size-3" />
            </button>
          </div>
          {joinedDate && (
            <span className="text-xs text-muted-foreground">{joinedDate} 가입</span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSheetOpen(true);
          }}
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

      <MemberCardDialog
        memId={memId}
        memNm={fullName}
        teamId={teamId}
        open={cardOpen}
        onOpenChange={setCardOpen}
        isOwner
        // 상세 카드 안에서 한마디를 수정하면 압축 카드 줄도 즉시 맞춘다.
        onIntroSaved={setIntro}
      />

      <IntroEditDialog
        open={introOpen}
        onOpenChange={setIntroOpen}
        initialValue={intro}
        onSaved={setIntro}
      />
    </>
  );
}
