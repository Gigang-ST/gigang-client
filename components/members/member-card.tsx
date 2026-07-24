import { MapPin, Timer, Footprints } from "lucide-react";

import {
  getJoinPurposeLabels,
  getRunningProfileChips,
} from "@/lib/member-card";
import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { CardItem } from "@/components/ui/card";

import type { LucideIcon } from "lucide-react";
import type { RunningProfileChip } from "@/lib/member-card";
import type { MemberCardCompactData } from "@/lib/queries/member-card";

/** 러닝 프로필 조각별 아이콘 — lib은 lucide를 모르므로 여기서 붙인다 */
const CHIP_ICON: Record<RunningProfileChip["kind"], LucideIcon> = {
  pace: Timer,
  dist: Footprints,
  stn: MapPin,
};

/**
 * 러닝 프로필 아이콘 칩 — `⏱ 6'00"/km` 처럼 아이콘 + 값 한 조각.
 * 값이 뭘 뜻하는지 아이콘으로 한눈에 잡히게, 밋밋한 텍스트 나열을 대신한다.
 */
function ProfileChip({ chip }: { chip: RunningProfileChip }) {
  const Icon = CHIP_ICON[chip.kind];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
      <Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="font-numeric text-[11px] text-foreground tabular-nums">
        {chip.value}
      </span>
    </span>
  );
}

/** 가입 목적 칩 — 러닝 프로필과 톤을 구분하려 테두리형으로 */
function PurposeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
      {label}
    </span>
  );
}

/**
 * 컴팩트 프로필 카드 — "이 사람이 누구인지"를 한 장에.
 *
 * 상세 카드가 "이 사람의 실적"(기록·칭호 목록·최근활동)이라면 이쪽은 자기소개다.
 * 그래서 기록·수치는 넣지 않고 한마디와 러닝 프로필을 싣는다 — 실적이 아직 없는
 * 신규 멤버도 채워지는 카드여야 하기 때문이다.
 *
 * 러닝 프로필은 아이콘 칩(페이스·거리·역)으로, 가입 목적은 테두리 칩으로 그린다.
 * 한 줄 텍스트로 나열하면 스펙표처럼 밋밋하고, 정보가 적은 신규 멤버는 더 비어 보인다.
 *
 * 순수 표현 컴포넌트 — 데이터는 props로만 받는다(피드 RPC가 payload를 내려주면 fetch 없이 그린다).
 * props가 `MemberCardCompactData`(좁힌 표면)라 상세 카드 payload 없이도 그릴 수 있다.
 */
export function MemberCardCompact({
  memId,
  data,
  meta,
  onSelect,
  className,
}: {
  /** 폴백 아바타 seed — 앱 전체가 mem_id로 통일 */
  memId: string;
  data: MemberCardCompactData;
  /** 우측 상단 슬롯 — 목록마다 다른 맥락 정보(신규멤버는 가입일) */
  meta?: React.ReactNode;
  /**
   * 카드 전체를 누를 수 있게 만든다(보통 상세 카드 열기).
   * 이때 칭호 배지의 툴팁은 끈다 — 툴팁이 있으면 배지가 `<button>`이 되어 버튼이 중첩된다.
   * 설명은 어차피 상세 카드에서 볼 수 있다.
   */
  onSelect?: () => void;
  className?: string;
}) {
  const frameCls = getFrameCls(data.frame_cd);
  const clickable = onSelect != null;

  const chips = getRunningProfileChips(data.running_profile);
  const purposes = getJoinPurposeLabels(data.running_profile);
  // 직접 쓴 한마디(join_purp_txt)는 러닝 프로필 자리에서 한 줄로 보여준다 — 칩보다 본인 말이 낫다.
  const purposeTxt = data.running_profile?.join_purp_txt?.trim() || null;

  // 러닝 프로필·목적·직접 쓴 목적 중 하나라도 있으면 하단 메타 영역을 그린다.
  const hasMeta = chips.length > 0 || purposes.length > 0 || Boolean(purposeTxt);

  const body = (
    <>
      <Avatar src={data.avatar_url} seed={memId} alt={data.mem_nm} size="lg" />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-bold text-foreground">
            {data.mem_nm}
          </span>
          {data.primary_title && (
            <TitleBadge
              name={data.primary_title.ttl_nm}
              effect={data.badge_effect}
              size="xs"
              tooltip={
                clickable
                  ? undefined
                  : {
                      desc: data.primary_title.ttl_desc,
                      visibility: data.primary_title.desc_visibility,
                      isHeld: true,
                    }
              }
            />
          )}
        </div>

        {data.intro_txt && (
          <span className="truncate text-[13px] text-muted-foreground">
            {data.intro_txt}
          </span>
        )}

        {/* 러닝 프로필 + 가입 목적 — 아이콘/테두리 칩으로 시각화 */}
        {hasMeta && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <ProfileChip key={chip.kind} chip={chip} />
            ))}
            {purposeTxt ? (
              <span className="truncate text-[11px] text-muted-foreground">
                “{purposeTxt}”
              </span>
            ) : (
              purposes.map((label) => <PurposeChip key={label} label={label} />)
            )}
          </div>
        )}
      </div>

      {meta && <div className="shrink-0 self-start">{meta}</div>}
    </>
  );

  const cls = cn("flex w-full items-start gap-3 text-left", frameCls, className);

  if (clickable) {
    return (
      <CardItem asChild className={cls}>
        <button
          type="button"
          onClick={onSelect}
          aria-label={`${data.mem_nm} 프로필 보기`}
          className="transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
        >
          {body}
        </button>
      </CardItem>
    );
  }

  return <CardItem className={cls}>{body}</CardItem>;
}
