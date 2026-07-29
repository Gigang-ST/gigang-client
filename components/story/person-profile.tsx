import {
  getJoinPurposeLabels,
  getRunningProfileChips,
} from "@/lib/member-card";

import { Avatar } from "@/components/common/avatar";
import { TitleBadge } from "@/components/common/title-badge";
import { ProfileChip, PurposeChip } from "@/components/members/profile-chip";
import { IntroQuote } from "@/components/story/intro-quote";

import type { ReactNode } from "react";
import type { TitleDescVisibility } from "@/components/common/title-badge";
import type { MemberCardCompactData } from "@/lib/queries/member-card";

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
  intro_txt?: string | null;
  primary_title?: {
    ttl_nm: string;
    ttl_desc: string | null;
    desc_visibility: TitleDescVisibility;
  } | null;
  running_profile?: MemberCardCompactData["running_profile"];
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
        {/* "활동지수 N위" 배지는 걷어냈다 — kicker("이번 달 기강 잡는")가 이미 같은 말을
            하고 있어 이름 아래에서 한 번 더 붙일 값이 아니었다. 이름 스택이 64→44px로
            줄면서 헤드라인이 2줄이 돼도 슬롯이 안 눌린다(§story-lede 높이 주석). */}
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
  // `bestRecord`는 더 이상 이 컴포넌트가 그리지 않는다 — 리드 슬롯 footer로 내려갔다.
  // parts에 남아 있어도 무시한다(호출부가 함께 정리될 때까지 조용히 넘어가게).
  const topParts = parts.filter(
    (p) => p !== "bestRecord" && p !== "intro",
  );
  const showIntro = parts.includes("intro");

  const topLeftNodes = topParts
    .map((part) => renderPart(part, person))
    .filter((node): node is ReactNode => node != null);

  const intro = showIntro ? renderPart("intro", person) : null;
  // 아래 줄 — 인용구. 응원 버튼은 리드 슬롯의 footer 밴드가 맡는다(여기서 그리지 않는다).
  const hasBottom = intro != null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* 상단 2단 — items-stretch로 좌우 컬럼 높이를 맞춘다(짧은 쪽이 늘어나 바닥선이 맞음) */}
      <div className="flex min-w-0 items-stretch gap-4">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
          {headerNode}
          {topLeftNodes}
        </div>

        {/* 오른쪽 — **이번 달 활동이 주인공이다.**
            예전엔 최고기록(22px)이 위에 크게 서고 참석·기록(17px)이 그 아래 작게 붙어,
            "이번 달 얼마나 뛰었나"를 말하는 슬롯인데 역대 PB가 제일 큰 숫자였다.
            지금은 참석·기록을 27px로 키워 이 칸의 주어로 삼는다. 최고기록은 이 컬럼에서
            빼서 리드 슬롯 footer의 한 줄 사실로 내려보낸다(§story-lede footNote). */}
        {hasCounts && (
          <div className="flex shrink-0 items-start gap-4 self-center">
            <CountStat value={person.mth_attd_cnt ?? 0} label="참석" />
            <CountStat value={person.mth_rec_cnt ?? 0} label="기록" />
          </div>
        )}
      </div>

      {/* 아래 — 인용구 한 줄. 전체 폭을 쓴다(2단 안에선 폭이 좁아 두 줄로 접혔다). */}
      {hasBottom && <div className="min-w-0">{intro}</div>}
    </div>
  );
}

/**
 * 한마디를 아직 안 쓴 사람의 자리 채움 문구 — **한 줄로 고정**이다.
 *
 * 사람마다 다른 문구를 돌리면 "이 사람이 저런 말을 골랐나" 하고 개인의 말처럼 읽히기
 * 시작한다. 하나로 고정하면 몇 번만 봐도 "한마디를 안 쓴 사람 자리"라는 표시로 학습돼,
 * 오히려 오해가 없다.
 *
 * 사실을 주장하지 않는 문장이라는 점도 중요하다 — "출석부는 꽉 찼다" 같은 건 그 사람이
 * 실제로 그런지 알 수 없고, 아니면 크루 앞에서 잘못 소개하는 셈이 된다. 이 문장은
 * "말이 없다"는 상태 자체를 농담으로 받는 말이라 누구에게 붙어도 틀리지 않는다.
 */
const INTRO_PLACEHOLDER = "고수는 말이 필요 없는 법";

/**
 * 한마디 자리의 빈 상태 — 인용구와 **같은 블록**이라 줄 높이가 어긋나지 않는다.
 *
 * 다만 **본인이 한 말인 척하지 않는다**: 따옴표를 빼고 색을 흐리게 둬서, 읽는 사람이
 * "이건 이 사람이 쓴 게 아니라 아직 안 쓴 것"임을 한눈에 구분하게 한다. 탭 툴팁도 없다
 * (펼칠 뒷말이 없다).
 */
function IntroPlaceholder() {
  return (
    <p className="block w-full truncate rounded-r-md border-l-2 border-border/60 bg-muted/30 py-1.5 pl-2.5 pr-2 text-[13.5px] leading-relaxed text-muted-foreground/80">
      {INTRO_PLACEHOLDER}
    </p>
  );
}

/** 이번 달 수치 한 칸 — 라벨(위·작게) + 숫자(아래·크게). 이 슬롯의 주어라 크게 세운다. */
function CountStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] leading-none text-muted-foreground">{label}</span>
      <span className="font-numeric text-[27px] font-medium leading-none text-foreground tabular-nums">
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
      // 사람의 말이라 인용구로 — 한 줄로 눕다 넘치면 …로 자르고, 탭하면 전체가 툴팁으로 뜬다.
      if (txt) return <IntroQuote key="intro" text={txt} />;
      // 한마디가 없어도 **자리는 남긴다** — 쓴 사람과 안 쓴 사람 사이에 슬롯 구성이
      // 달라지면 스와이프할 때마다 아래 내용이 위아래로 뛴다.
      return <IntroPlaceholder key="intro" />;
    }

    // `bestRecord`는 이 컴포넌트가 그리지 않는다 — 위 `topParts` 필터가 걸러내므로
    // 여기까지 오지 않는다. 타입은 호출부 호환을 위해 남기되 렌더 분기는 두지 않는다
    // (두면 "아직 그려지나?"를 매번 되짚게 된다). 개인 최고기록은 프로필 카드가 맡는다.
    case "bestRecord":
      return null;

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
