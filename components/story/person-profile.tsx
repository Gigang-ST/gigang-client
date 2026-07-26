import { Medal } from "lucide-react";

import { secondsToTime } from "@/lib/dayjs";
import {
  getJoinPurposeLabels,
  getRecordLabel,
  getRunningProfileChips,
} from "@/lib/member-card";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { ProfileChip, PurposeChip } from "@/components/members/profile-chip";

import type { ReactNode } from "react";
import type { TitleDescVisibility } from "@/components/common/title-badge";
import type {
  MemberCardCompactData,
  MemberCardRecord,
} from "@/lib/queries/member-card";

/**
 * 프로필 부품 — 리드 슬롯이 원하는 조각만 골라 조립한다.
 *
 * · `title`          이름 옆 칭호 배지
 * · `intro`          소개 한마디(intro_txt)
 * · `bestRecord`     개인 최고기록(가장 긴 거리 종목 1건)
 * · `runningProfile` 페이스·거리·역 칩 + 가입 목적
 *
 * `parts` 배열의 **순서가 곧 렌더 순서**다. 아바타+이름은 부품과 무관하게 항상 그린다.
 * 데이터가 없는 부품은 렌더하지 않아(그 자리 null) 빈 gap이 남지 않는다.
 */
export type PersonProfilePart = "title" | "intro" | "bestRecord" | "runningProfile";

export type PersonProfilePerson = {
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  /** 아래는 부품에 따라 필요한 것만 채워지므로 전부 옵셔널(배포 스큐 시 undefined일 수도) */
  badge_effect?: string;
  frame_cd?: string;
  intro_txt?: string | null;
  primary_title?: {
    ttl_nm: string;
    ttl_desc: string | null;
    desc_visibility: TitleDescVisibility;
  } | null;
  running_profile?: MemberCardCompactData["running_profile"];
  /** 개인 최고기록 목록 — 종목별 최고기록(거리 긴 순). bestRecord 부품이 목록으로 그린다 */
  best_records?: MemberCardRecord[];
  /** 이번 달 모임 참석 수 — 오른쪽 수치 칸에 쓴다(있을 때만) */
  mth_attd_cnt?: number;
  /** 이번 달 대회 기록 등록 수 */
  mth_rec_cnt?: number;
};

/**
 * 부품 조합 프로필 — "이 사람이 누구인지"를 아바타+이름 위에 원하는 조각으로 쌓는다.
 *
 * MemberCardCompact가 목록용 카드라면 이쪽은 리드 전광판의 한 슬롯 몸통이다. 같은 칩·배지를
 * 써(profile-chip·TitleBadge) 두 곳이 한 시스템으로 읽히되, 레이아웃은 리드 슬롯(세로 여유)에
 * 맞춰 조각을 세로로 쌓는다. onSelect를 주면 아바타·이름이 버튼이 되어 카드가 열린다.
 */
export function PersonProfile({
  person,
  parts,
  onSelect,
}: {
  person: PersonProfilePerson;
  parts: PersonProfilePart[];
  onSelect?: (memId: string, name: string) => void;
}) {
  const showTitle = parts.includes("title") && person.primary_title != null;

  // 이름 옆 헤더(아바타 + 이름 + 칭호) — title 부품은 여기서 소비한다(이름 옆이 칭호의 자리).
  const header = (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar
        src={person.avatar_url}
        seed={person.mem_id}
        alt={person.mem_nm}
        size="lg"
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate text-[17px] font-bold text-foreground">
          {person.mem_nm}
        </span>
        {showTitle && person.primary_title && (
          <TitleBadge
            name={person.primary_title.ttl_nm}
            effect={person.badge_effect ?? "none"}
            size="xs"
          />
        )}
      </div>
    </div>
  );

  const headerNode = onSelect ? (
    <button
      type="button"
      onClick={() => onSelect(person.mem_id, person.mem_nm)}
      aria-label={`${person.mem_nm} 프로필 보기`}
      className="flex min-w-0 items-center rounded-2xl text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
    >
      {header}
    </button>
  ) : (
    header
  );

  // 이번 달 수치 — 참석·기록 중 하나라도 값이 있으면 오른쪽 칸을 그린다.
  const hasCounts =
    person.mth_attd_cnt != null || person.mth_rec_cnt != null;

  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {headerNode}
        {/* title은 헤더에서 소비했으니 body에선 나머지 부품만. null 조각은 걸러 gap 헛간격 방지. */}
        {parts
          .map((part) => renderPart(part, person))
          .filter((node): node is ReactNode => node != null)}
      </div>

      {/* 오른쪽 — 이번 달 참석·기록 수치. 프로필(왼쪽)과 세로 위 정렬로 나란히. */}
      {hasCounts && (
        <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
          <CountStat value={person.mth_attd_cnt ?? 0} label="참석" />
          <CountStat value={person.mth_rec_cnt ?? 0} label="기록" />
        </div>
      )}
    </div>
  );
}

/** 이번 달 수치 한 칸 — 큰 숫자 + 작은 라벨(참석/기록) */
function CountStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-numeric text-[20px] font-semibold leading-none text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

/** 부품 하나를 그린다 — 데이터가 없으면 null(그 자리 렌더 안 함) */
function renderPart(
  part: PersonProfilePart,
  person: PersonProfilePerson,
): ReactNode {
  switch (part) {
    // 헤더에서 이미 그렸다.
    case "title":
      return null;

    case "intro": {
      const txt = person.intro_txt?.trim();
      if (!txt) return null;
      return (
        <p
          key="intro"
          className="line-clamp-2 break-keep text-[13px] leading-relaxed text-muted-foreground"
        >
          {txt}
        </p>
      );
    }

    case "bestRecord": {
      const recs = person.best_records ?? [];
      if (recs.length === 0) return null;
      // 종목별 최고기록 목록 — 각 줄: [메달] 종목 라벨(풀코스/하프/…) + 완주 기록. 거리 긴 순.
      // 한 줄씩이라 각 행은 세로 가운데 정렬(items-center). 자리가 남아 여러 종목을 나란히 싣는다.
      return (
        <ul key="bestRecords" className="flex min-w-0 flex-col gap-1">
          {recs.map((rec) => (
            <li
              key={`${rec.sport}-${rec.evt}`}
              className="flex min-w-0 items-center gap-1.5"
            >
              <Medal
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="shrink-0 text-[13px] font-semibold text-foreground">
                {getRecordLabel(rec)}
              </span>
              <span className="shrink-0 font-numeric text-[13px] font-medium text-foreground tabular-nums">
                {secondsToTime(rec.rec_time_sec)}
              </span>
            </li>
          ))}
        </ul>
      );
    }

    case "runningProfile": {
      const profile = person.running_profile ?? null;
      const chips = getRunningProfileChips(profile);
      const purposes = getJoinPurposeLabels(profile);
      const purposeTxt = profile?.join_purp_txt?.trim() || null;
      if (chips.length === 0 && purposes.length === 0 && !purposeTxt) return null;
      return (
        <div key="runningProfile" className="flex flex-wrap items-center gap-1.5">
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
      );
    }
  }
}
