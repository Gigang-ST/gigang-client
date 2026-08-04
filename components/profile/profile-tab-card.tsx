"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { IntroEditDialog } from "@/components/members/intro-edit-dialog";
import { MemberCardDetail } from "@/components/members/member-card-detail";
import { MemberCardDialogDynamic as MemberCardDialog } from "@/components/members/member-card-dialog-dynamic";
import { AvatarEditDialog } from "@/components/profile/avatar-edit-dialog";
import { CollectionSheet } from "@/components/profile/collection-sheet";
import { RaceHistoryDialog } from "@/components/profile/race-history-dialog";
import { RaceRecordDialog } from "@/components/profile/race-record-dialog";
import {
  UtmbLinkDialog,
  type UtmbProfile,
} from "@/components/profile/utmb-link-dialog";

import type { MemberStatus } from "@/components/races/types";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";
import type { MemberCardData } from "@/lib/queries/member-card";

/** 러닝 프로필 편집 진입점 — `/profile/edit`의 해당 섹션으로 바로 내린다 */
const RUNNING_PROFILE_HREF = "/profile/edit#running-profile";

/**
 * 프로필탭 본문 — **편집판**.
 *
 * 공개판(`MemberCardDialog`)과 같은 컴포넌트(`MemberCardDetail`)를 쓰되 `edit`을 넘겨
 * 빈 칸·연필·포인트를 켠다. 순서·서체·간격이 두 화면에서 구조적으로 갈릴 수 없다.
 *
 * 여기가 하는 일은 **편집 진입점을 다이얼로그에 연결**하는 것뿐이다:
 * - 러닝 프로필 + 가입 목적 → `/profile/edit` (폼이 이미 거기 한 벌 있다. 역 콤보박스·페이스
 *   셀렉트·목적 칩을 다이얼로그로 다시 만들면 두 벌이 되어 한쪽만 고쳐 어긋난다)
 * - 나머지(한마디·칭호·기록·UTMB)는 이미 다이얼로그가 있어 그 자리에서 연다
 */
export function ProfileTabCard({
  memId,
  teamMemId,
  teamId,
  card,
  utmb,
  primaryTtlId,
  maxRarityLevel,
  cmmCdRows,
  competitionRegisterMemberStatus,
}: {
  memId: string;
  teamMemId: string;
  teamId: string;
  card: MemberCardData;
  /** UTMB 연동 다이얼로그의 현재값 — 카드가 쓰는 `utmb_index`보다 상세하다(URL·최근 대회) */
  utmb: UtmbProfile | null;
  primaryTtlId: string | null;
  maxRarityLevel: number;
  cmmCdRows: CachedCmmCdRow[];
  competitionRegisterMemberStatus: MemberStatus;
}) {
  const router = useRouter();
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [publicCardOpen, setPublicCardOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [utmbOpen, setUtmbOpen] = useState(false);

  // 저장 직후 router.refresh()가 돌기 전에도 바뀐 값이 보이도록 낙관적으로 덮어쓴다.
  const [intro, setIntro] = useState(card.intro_txt ?? "");
  const [utmbState, setUtmbState] = useState(utmb);
  // undefined = 아직 안 고침(서버 값 그대로). null은 "기본 이미지로 되돌림"이라 구분이 필요하다.
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(
    undefined,
  );

  const view: MemberCardData = {
    ...card,
    intro_txt: intro || null,
    utmb_index: utmbState?.utmb_index ?? null,
    ...(avatarUrl !== undefined && { avatar_url: avatarUrl }),
  };

  return (
    <>
      <MemberCardDetail
        memId={memId}
        data={view}
        edit={{
          onOpenPublicCard: () => setPublicCardOpen(true),
          onEditAvatar: () => setAvatarOpen(true),
          onEditIntro: () => setIntroOpen(true),
          onEditTitles: () => setCollectionOpen(true),
          onEditProfile: () => router.push(RUNNING_PROFILE_HREF),
          onManageRecords: () => setHistoryOpen(true),
          onAddRecord: () => setRecordOpen(true),
          onLinkUtmb: () => setUtmbOpen(true),
          point: card.stats.activity_score,
        }}
      />

      <AvatarEditDialog
        open={avatarOpen}
        onOpenChange={setAvatarOpen}
        memId={memId}
        memNm={card.mem_nm}
        currentUrl={view.avatar_url}
        onSaved={setAvatarUrl}
      />

      <IntroEditDialog
        open={introOpen}
        onOpenChange={setIntroOpen}
        initialValue={intro}
        onSaved={setIntro}
      />

      <CollectionSheet
        open={collectionOpen}
        onClose={() => setCollectionOpen(false)}
        teamMemId={teamMemId}
        teamId={teamId}
        currentPrimaryTtlId={primaryTtlId}
        currentBadgeEffect={card.badge_effect}
        currentFrameCd={card.frame_cd}
        maxRarityLevel={maxRarityLevel}
        memberName={card.mem_nm}
      />

      {/* 남들에게 보이는 내 카드 — 같은 판의 공개 뷰라 편집 어포던스가 하나도 없다.
          고치는 자리는 이 탭 한 곳이고, 팝업은 결과를 확인하는 자리다. */}
      <MemberCardDialog
        memId={memId}
        memNm={card.mem_nm}
        teamId={teamId}
        open={publicCardOpen}
        onOpenChange={setPublicCardOpen}
      />

      <RaceRecordDialog
        memberId={memId}
        teamId={teamId}
        cmmCdRows={cmmCdRows}
        open={recordOpen}
        onOpenChange={setRecordOpen}
        competitionRegisterMemberStatus={competitionRegisterMemberStatus}
        onSaved={() => {
          setRecordOpen(false);
          router.refresh();
        }}
      />

      <RaceHistoryDialog
        memberId={memId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onChanged={() => router.refresh()}
      />

      <UtmbLinkDialog
        open={utmbOpen}
        onOpenChange={setUtmbOpen}
        utmb={utmbState}
        onSaved={(next) => {
          setUtmbState(next);
          router.refresh();
        }}
      />
    </>
  );
}
