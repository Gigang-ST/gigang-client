import { MapPin, Timer, Footprints } from "lucide-react";

import type { LucideIcon } from "lucide-react";
import type { RunningProfileChip } from "@/lib/member-card";

/**
 * 러닝 프로필/가입 목적 칩 — 간단 카드(MemberCardCompact)와 리드 전광판(PersonProfile)이
 * **픽셀 단위로 같은 칩**을 그려야 "프로필 부품"이 한 시스템으로 읽힌다. 그래서 로컬로
 * 두지 않고 여기로 뽑아 두 곳이 함께 import한다(한쪽만 고치면 드리프트한다).
 */

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
export function ProfileChip({ chip }: { chip: RunningProfileChip }) {
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
export function PurposeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
      {label}
    </span>
  );
}
