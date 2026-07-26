import { secondsToTime } from "@/lib/dayjs";
import {
  getJoinPurposeLabels,
  getRecordLabel,
  getRunningProfileChips,
} from "@/lib/member-card";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { ProfileChip, PurposeChip } from "@/components/members/profile-chip";
import { IntroQuote } from "@/components/story/intro-quote";

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
  rank,
  reactionSlot,
  onSelect,
}: {
  person: PersonProfilePerson;
  parts: PersonProfilePart[];
  /** 이번 달 활동지수 순위 — 주면 이름 아래에 "활동지수 N위" 배지를 얹는다(왜 이 사람이 떴는지) */
  rank?: number;
  /**
   * 인용구(한마디) 줄 우측에 끼울 노드 — 활동지수 슬롯의 응원 버튼이 여기 온다.
   * 왼쪽 인용구는 남는 폭을 다 쓰고, 이 슬롯은 오른쪽 끝에 붙는다(같은 바닥선에서 마주본다).
   */
  reactionSlot?: ReactNode;
  onSelect?: (memId: string, name: string) => void;
}) {
  const showTitle = parts.includes("title") && person.primary_title != null;

  // 이름 옆 헤더(아바타 + 이름 + 칭호) — title 부품은 여기서 소비한다(이름 옆이 칭호의 자리).
  // 이름 + 칭호를 세로로 쌓는다(가로 나열이 아니라) — 칭호가 길면 flex-wrap이 이름 아래로
  // 떨어뜨려 아바타와 세로 중심이 어긋난다. 블록 자체는 아바타와 세로 중앙(items-center)에서
  // 마주보고, 이름·칭호는 그 안에서 가로 가운데 정렬 — 칭호 배지가 이름보다 넓어도 이름이
  // 배지 폭 한가운데에 오게(왼쪽 정렬이면 이름이 왼쪽으로 쏠려 보인다).
  const header = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar
        src={person.avatar_url}
        seed={person.mem_id}
        alt={person.mem_nm}
        size="lg"
      />
      <div className="flex min-w-0 flex-col items-center gap-1">
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
        {/* 활동지수 순위 — "왜 이 사람이 여기 떴는지"를 이름 아래에서 곧바로 말한다.
            점수(actv_score)는 노출하지 않고 순위만(히든 운영 결). */}
        {rank != null && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-numeric text-[11px] font-semibold text-primary tabular-nums">
            활동지수 {rank}위
          </span>
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

  // 이번 달 수치 — 참석·기록 중 하나라도 값이 있으면 오른쪽 칸에 싣는다.
  const hasCounts =
    person.mth_attd_cnt != null || person.mth_rec_cnt != null;

  // 상단은 좌우 2단 — 왼쪽 "이 사람이 누구인지"(아바타·이름·칭호·순위), 오른쪽 "이 사람의
  // 실적"(최고기록 + 이번 달 참석·기록). 인용구(intro)와 러닝프로필은 이 2단에서 빼서
  // **아래 전체 폭 줄**로 내린다 — 좌우 컬럼은 인물/실적만 담아 높이가 서로 비슷하게 맞는다.
  const topParts = parts.filter(
    (p) => p !== "bestRecord" && p !== "intro",
  );
  const showRecords = parts.includes("bestRecord");
  const showIntro = parts.includes("intro");

  const topLeftNodes = topParts
    .map((part) => renderPart(part, person))
    .filter((node): node is ReactNode => node != null);

  const records = showRecords ? renderPart("bestRecord", person) : null;
  const intro = showIntro ? renderPart("intro", person) : null;
  // 오른쪽 컬럼은 최고기록·수치 중 하나라도 있을 때만 그린다(둘 다 없으면 왼쪽이 폭을 다 쓴다).
  const hasRight = records != null || hasCounts;
  // 아래 줄 — 인용구(왼쪽)와 응원(오른쪽). 둘 중 하나라도 있을 때만 그린다.
  const hasBottom = intro != null || reactionSlot != null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {/* 상단 2단 — items-stretch로 좌우 컬럼 높이를 맞춘다(짧은 쪽이 늘어나 바닥선이 맞음) */}
      <div className="flex min-w-0 items-stretch gap-4">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
          {headerNode}
          {topLeftNodes}
        </div>

        {/* 오른쪽 — 실적. 위에 대표 최고기록, 아래에 이번 달 참석·기록 수치.
            둘 사이 얇은 괘선으로 "역대 최고기록"과 "이번 달 활동"을 가른다. */}
        {hasRight && (
          <div className="flex shrink-0 flex-col items-end justify-center gap-2.5">
            {records}
            {hasCounts && (
              <div className="flex flex-col items-end gap-2">
                {records && <div className="h-px w-full bg-border" aria-hidden />}
                <div className="flex items-start gap-4">
                  <CountStat value={person.mth_attd_cnt ?? 0} label="참석" />
                  <CountStat value={person.mth_rec_cnt ?? 0} label="기록" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 아래 — 인용구 한 줄(왼쪽, 남는 폭을 다 씀) ↔ 응원 버튼(오른쪽 끝). 같은 바닥선에서
          마주본다. intro는 여기서 한 줄로 길게 눕는다(2단 안에선 폭이 좁아 두 줄로 접혔다). */}
      {hasBottom && (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">{intro}</div>
          {reactionSlot && <div className="shrink-0">{reactionSlot}</div>}
        </div>
      )}
    </div>
  );
}

/** 이번 달 수치 한 칸 — 라벨(위·작게) + 숫자(아래·크게). 최고기록 아래 두 칸을 나란히 세운다. */
function CountStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] leading-none text-muted-foreground">{label}</span>
      <span className="font-numeric text-[17px] font-semibold leading-none text-foreground tabular-nums">
        {value}
      </span>
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
      // 사람의 말이라 인용구로 — 한 줄로 눕다 넘치면 …로 자르고, 탭하면 전체가 툴팁으로 뜬다.
      return <IntroQuote key="intro" text={txt} />;
    }

    case "bestRecord": {
      const recs = person.best_records ?? [];
      // 기록이 없으면 이 조각은 아예 그리지 않는다(프로필 나머지는 정상). 빈 줄을 남기지 않는다.
      if (recs.length === 0) return null;
      // 대표 최고기록 **1건만** — recs는 RPC가 풀 > 하프 > 10K 우선(그 외 종목은 뒤로)으로 주므로
      // recs[0]은 풀코스(있으면) → 없으면 하프 → 10K 순의 대표다. 여러 건을 세우면 오른쪽이
      // 목록 낭독이 돼 무게중심이 아래로 쏠린다. 라벨(작게) 위에 기록(크게)을 세로로 쌓아 또렷이.
      const rec = recs[0];
      return (
        <div key="bestRecord" className="flex flex-col items-end gap-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            {getRecordLabel(rec)}
          </span>
          <span className="font-numeric text-[22px] font-semibold leading-none text-foreground tabular-nums">
            {secondsToTime(rec.rec_time_sec)}
          </span>
        </div>
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
