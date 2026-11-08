"use client";

import { useState } from "react";

import Link from "next/link";

import { secondsToTime } from "@/lib/dayjs";
import {
  HYROX_STATIONS,
  HYROX_STATION_CODES,
  formatHyroxGap,
  hasHyroxStation,
  hyroxSplitGaps,
  hyroxStationHolders,
  viewHyroxBy,
  type HyroxBoard,
  type HyroxEntry,
  type HyroxGaps,
  type HyroxSortKey,
  type HyroxStationCode,
  type HyroxStationHolder,
  type HyroxView,
  type HyroxViewEntry,
} from "@/lib/hyrox";
import { getFrameCls } from "@/lib/title-effects";
import {
  flattenTriathlon,
  getEmptyTriathlonSlots,
  getMyIndexStanding,
  getMyTimeStanding,
  splitChampion,
  type MyStanding,
} from "@/lib/records-board";
import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { HelpTip } from "@/components/common/help-tip";
import { SegmentControl } from "@/components/common/segment-control";
import { TitleBadge } from "@/components/common/title-badge";
import { MemberCardDialogDynamic as MemberCardDialog } from "@/components/members/member-card-dialog-dynamic";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";

/** 엔트리 행을 탭하면 그 멤버의 프로필 카드를 연다 */
type SelectMember = (memId: string, name: string) => void;

/** 행 전체를 프로필 카드 진입점으로 쓰기 위한 공통 props */
function memberRowProps(
  entry: { memId: string; name: string },
  onSelect: SelectMember,
  actionLabel = "프로필 보기",
) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: () => onSelect(entry.memId, entry.name),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(entry.memId, entry.name);
      }
    },
    "aria-label": `${entry.name} ${actionLabel}`,
  };
}

/** 행 진입점 공통 스타일 — 탭 가능함을 드러내고 키보드 포커스를 보이게 한다 */
const ROW_INTERACTIVE_CLS =
  "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/** 챔피언 카드 진입점 — 행 카드와 달리 ring offset을 두지 않는다(프레임 테두리와 겹친다) */
const CHAMPION_INTERACTIVE_CLS =
  "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * 내 행으로 보내는 앵커 id — 판독선이 이걸 찾아 스크롤한다.
 *
 * 내 행에 색을 칠하지는 않는다. 바로 위 판독선이 이미 내 순위를 말하고 눌러서 데려다주므로,
 * 강조까지 더하면 같은 사실을 두 번 말한다. 게다가 1위일 땐 내 행이 목록에 없어(띠로 올라감)
 * 강조가 통째로 사라지는데, 그러면 **1등이 되는 순간 화면에서 내 존재감이 오히려 약해진다**.
 */
const myRowId = (memId: string) => `hof-me-${memId}`;

/* ------------------------------------------------------------------ */
/*  타입 정의                                                          */
/* ------------------------------------------------------------------ */

type DescVisibility = "always" | "others" | "held" | "never";
type MemberTitleBase = { ttl_nm: string; ttl_desc: string | null; desc_visibility: DescVisibility; badge_effect: string; frame_cd: string };
type MemberTitle = MemberTitleBase & { isHeld: boolean };

/** 랭킹 RPC엔 없는 표면 — 챔피언 띠가 얼굴과 한마디를 세운다 */
type MemberMeta = { avatar_url: string | null; intro_txt: string | null };

type RankingEntry = {
  rank: number;
  memId: string;
  name: string;
  record: string;
  recordSec: number;
  raceName: string | null;
};

type MarathonEvent = {
  eventType: string;
  label: string;
  male: RankingEntry[];
  female: RankingEntry[];
};

type TrailEntry = {
  rank: number;
  memId: string;
  name: string;
  utmbIndex: number;
  recentRaceName: string | null;
  recentRaceRecord: string | null;
  utmbProfileUrl: string | null;
};

type TriathlonEntry = {
  rank: number;
  memId: string;
  name: string;
  record: string;
  recordSec: number;
  raceName: string | null;
};

type TriathlonEvent = {
  eventType: string;
  label: string;
  entries: TriathlonEntry[];
};

type RecordsData = {
  marathon: { events: MarathonEvent[] };
  trail: { entries: TrailEntry[] };
  triathlon: { events: TriathlonEvent[] };
  /** 옛 캐시(v8 이하)엔 없다 — 없으면 빈 판 */
  hyrox?: { boards: HyroxBoard[] };
  memberTitles: Record<string, MemberTitleBase>;
  memberMeta: Record<string, MemberMeta>;
};

/** 세 판이 공통으로 들고 다니는 표면 — prop 목록이 함수마다 길어지는 걸 막는다 */
export type BoardContext = {
  memberTitles: Record<string, MemberTitle>;
  memberMeta: Record<string, MemberMeta>;
  myMemId: string | null;
  onSelectMember: SelectMember;
  /** 행을 눌렀을 때 하는 일의 이름(스크린리더용) — 하이록스 판은 프로필 대신 스플릿을 펼친다 */
  rowActionLabel?: string;
};

/* ------------------------------------------------------------------ */
/*  카테고리 탭 정의                                                    */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  { value: "marathon", label: "마라톤" },
  { value: "trail", label: "트레일러닝" },
  { value: "hyrox", label: "하이록스" },
  { value: "triathlon", label: "철인3종" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["value"];

/* ------------------------------------------------------------------ */
/*  순위 표시                                                          */
/* ------------------------------------------------------------------ */

/**
 * 시상대 표시 — 은·동은 **어두운 메달 칩 위에 메탈릭 shimmer 숫자**.
 *
 * 1위는 띠로 올라가므로 여기 남는 건 2·3위다.
 *
 * 색만 바꾼 맨숫자는 등수가 아니라 그냥 회색 글씨로 보였다. 앱엔 이미 금속 질감을 내는 표현이
 * 있으므로(`title-effect-silver/bronze` — 칭호 이펙트) 그걸 그대로 쓴다. 새 어휘를 만들지 않고,
 * 외부 이미지도 받지 않는다(아티팩트·PWA 모두 외부 요청이 없는 편이 낫다).
 *
 * 칩 바탕이 어두운 건 필수다 — 이 효과는 `background-clip: text`라 밝은 지면에선 은색이
 * 흰 종이에 흰 글씨가 된다(대비 2.4:1). 칭호 배지가 `bg-zinc-900`인 것과 같은 이유.
 */
const PODIUM_CHIP: Record<number, string> = {
  2: "bg-zinc-900 ring-1 ring-rank-silver/50",
  3: "bg-zinc-900 ring-1 ring-rank-bronze/50",
};
const PODIUM_NUM: Record<number, string> = {
  2: "title-effect-silver",
  3: "title-effect-bronze",
};

function RankMark({ rank, size = "sm" }: { rank: number; size?: "sm" | "md" }) {
  const chip = PODIUM_CHIP[rank];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center font-mono font-bold tabular-nums",
        size === "sm" ? "size-5 text-[11px]" : "size-7 text-[15px]",
        // 4위 이하는 맨숫자 — 시상대에 선 둘만 메달을 단다
        chip ? cn("rounded-full", chip) : "text-muted-foreground",
      )}
      aria-label={`${rank}위`}
    >
      <span className={cn("inline-block", PODIUM_NUM[rank] && `${PODIUM_NUM[rank]} hof-podium`)}>
        {rank}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  챔피언 띠 + 내 기록 판독선                                          */
/* ------------------------------------------------------------------ */

/**
 * 전당 머리 띠 — 화면 좌우 끝까지 붙되 **지면과 같은 색**이다.
 *
 * 한때 이 자리를 `bg-board`(항상 야간)로 깔았다. 칭호 프레임 glow가 어두운 판에서만 제대로
 * 켜진다는 이유였는데, 실제로 라이트 테마에서 보면 **다크모드가 깨진 것처럼** 읽혔다.
 * DESIGN.md가 board 토큰에 붙여 둔 경고("glow가 없는 요소를 어둡게 만들려고 board를 가져다
 * 쓰지 않는다 — 그건 그냥 검은 상자")가 이 자리에도 그대로 들어맞았다:
 * 프레임을 가진 사람은 소수라 대부분의 화면에선 발광할 게 없고, 검은 띠만 남았다.
 *
 * 그래서 배경은 테마를 따르고(`bg-background`), 띠라는 건 위아래 괘선으로만 말한다.
 * 메탈릭 시상대 숫자처럼 **어두운 바탕이 꼭 필요한 것만** 자기 칩을 들고 다닌다.
 */
function ChampionBand({ eyebrow, action, children }: { eyebrow: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-y border-border bg-background px-6 pb-4 pt-3.5">
      <div className="flex items-center justify-between">
        {/* 제호의 금빛 shimmer는 지면 색과 무관하게 유지한다 — `title-effect-gold`는
            어두운 구간(#92681a)부터 시작하는 그라데이션이라 흰 지면에서도 글자가 남는다. */}
        <span className="title-effect-gold hof-masthead font-mono text-[15px] font-bold uppercase tracking-[0.28em]">
          {eyebrow}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * 얼굴 오른쪽에 서는 이름 덩이 — 이름 위, 칭호 아래.
 *
 * 한 줄에 나란히 두면 반칸(약 131px 안쪽)에서 긴 칭호가 이름을 다 갉아먹는다. 위아래로 쌓으면
 * 둘 다 남는 폭을 온전히 쓴다. **칭호가 없어도 자리를 비워 둔다**(`min-h`) — 남/여 두 칸이
 * 나란한 판이라 한쪽만 칭호가 있으면 아래 기록·대회명 줄이 서로 어긋나 계기판이 깨진다.
 */
function ChampionNameBlock({
  entry,
  ctx,
  size,
}: {
  entry: { memId: string; name: string };
  ctx: BoardContext;
  size: "sm" | "md";
}) {
  const title = ctx.memberTitles[entry.memId];
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span
        className={cn(
          "min-w-0 truncate font-semibold text-foreground",
          size === "sm" ? "text-[14px]" : "text-[16px]",
        )}
      >
        {entry.name}
      </span>
      <div className="flex min-h-[18px] min-w-0 overflow-hidden">
        {title && (
          <TitleBadge
            name={title.ttl_nm}
            effect={title.badge_effect}
            size="xs"
            tooltip={{ desc: title.ttl_desc, visibility: title.desc_visibility, isHeld: title.isHeld }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 한마디 — **최대 두 줄**, 넘치면 말줄임.
 *
 * 한 줄로 자르면 60자까지 쓸 수 있는 문장이 서너 글자 만에 잘리고, 줄 수를 열어 두면 긴 한마디
 * 하나가 옆 칸과 높이를 어긋나게 한다. 없어도 두 줄 높이를 예약해 두 칸이 늘 같은 판이 되게 한다.
 */
function ChampionQuote({ text }: { text: string | null | undefined }) {
  return (
    <p className="line-clamp-2 min-h-[30px] text-[11px] leading-snug text-muted-foreground">
      {text && (
        <>
          <span aria-hidden className="text-primary/60">&ldquo;</span>
          {text}
          <span aria-hidden className="text-primary/60">&rdquo;</span>
        </>
      )}
    </p>
  );
}

/**
 * 챔피언 판 — **카드 이펙트를 여기에 두른다.**
 *
 * `card-frame-*`는 이름 그대로 카드용이라 아바타에 붙이면 Avatar의 `overflow-hidden`에
 * pseudo-element가 잘려 22종 중 4종이 아예 안 켜지고, 켜지는 것도 32px 링이라 존재감이 없다.
 * 블록에 두르면 전부 켜지고 이펙트가 그만큼 크게 보인다. 띠가 지면 색을 쓰게 된 뒤로는
 * 프레임 안쪽을 덮는 `var(--card)`가 그대로 맞아떨어져 별도 오버라이드가 필요 없다.
 */
function ChampionCard({
  entry,
  ctx,
  children,
}: {
  entry: { memId: string; name: string };
  ctx: BoardContext;
  children: React.ReactNode;
}) {
  const title = ctx.memberTitles[entry.memId];
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-2xl border border-border p-2.5",
        CHAMPION_INTERACTIVE_CLS,
        getFrameCls(title?.frame_cd),
      )}
      {...memberRowProps(entry, ctx.onSelectMember, ctx.rowActionLabel)}
    >
      {children}
    </div>
  );
}

/**
 * 내 기록 판독선 — 띠 **밑단에 간격 없이 붙는다.**
 *
 * 이 줄은 순위축 위에 놓인다(1위 다음에 내가 오고 그 다음이 2위다). 카드처럼 떠 있으면 목록의
 * 한 행으로 읽혀 순위가 1, N, 2, 3으로 깨지므로, 띠에 딸린 판독선으로 층을 뗀다.
 * 격차(`1위까지 …`)가 붙어야 이 줄이 "N위 행"이 아니라 나와 전당 사이를 재는 계기가 된다.
 */
function MyStandingBand({
  standing,
  unit,
  targetId,
  onGo,
}: {
  standing: MyStanding;
  /** 값 뒤에 붙는 말 — 시간 종목은 없고 트레일은 "지수" */
  unit?: string;
  /** 목록 안 내 행의 앵커. 내가 1위면 목록에 없으므로 준 쪽만 버튼이 된다 */
  targetId?: string;
  /** 누를 때 먼저 할 일 — 하이록스 판은 내 행을 펼친다. 주면 내가 1위여도(목록에 없어도) 버튼이 된다 */
  onGo?: () => void;
}) {
  const body = (
    <>
      <span className="shrink-0 text-[10.5px] text-muted-foreground">
        내 {unit ?? "기록"}
      </span>
      <span className="font-mono text-[15px] font-bold tabular-nums">{standing.value}</span>
      <span className="text-[12px] font-semibold text-primary">{standing.rank}위</span>
      {standing.gap && (
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          1위보다{" "}
          <b className="font-mono font-bold tabular-nums text-foreground">{standing.gap}</b>
        </span>
      )}
    </>
  );

  const cls =
    "flex w-full items-center gap-2 border-b border-border bg-primary/[0.07] px-6 py-2 text-left";

  if (!targetId && !onGo) return <div className={cls}>{body}</div>;

  return (
    <button
      type="button"
      onClick={() => {
        onGo?.();
        if (!targetId) return;
        const target = document.getElementById(targetId);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        // 스크롤만 하면 포커스가 이 버튼에 남아, 키보드·스크린리더 사용자는 "내 행으로 갔다"를
        // 알 수 없다. 대상 카드가 이미 role="button" tabIndex=0이라 그대로 받을 수 있다.
        target.focus({ preventScroll: true });
      }}
      className={cn(
        cls,
        "transition-colors hover:bg-primary/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      )}
    >
      {body}
    </button>
  );
}

/**
 * 기록이 없는 사람에게 보이는 판독선 자리 — 등록으로 보낸다.
 *
 * 전당을 보고 "나도 올려야지"가 되는 게 이 화면의 자연스러운 출구인데, 기록 등록은
 * 프로필탭 다이얼로그에만 있어 여기서 갈 곳이 없었다.
 */
function RegisterPrompt({ message, linkLabel = "기록 등록" }: { message: string; linkLabel?: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-6 py-2">
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{message}</span>
      <Link
        href="/profile"
        className="shrink-0 rounded-full border border-primary/35 px-2.5 py-1 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  마라톤                                                             */
/* ------------------------------------------------------------------ */

/** 라벨 옆으로 괘선을 늘려 계기판 머리글로 만든다 — 오른쪽을 비워 두면 행이 반쪽만 남는다 */
function BoardRowLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 font-mono text-[9px] tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}

/** 챔피언 띠의 한 칸(남/여). 비어 있으면 "아직 안 켜진 계기"로 남긴다 */
function MarathonChampionSlot({
  who,
  entry,
  ctx,
}: {
  who: string;
  entry: RankingEntry | null;
  ctx: BoardContext;
}) {
  const meta = entry ? ctx.memberMeta[entry.memId] : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <BoardRowLabel label={who} />

      {entry ? (
        <ChampionCard entry={entry} ctx={ctx}>
          <div className="flex min-w-0 items-center gap-2">
            <Avatar src={meta?.avatar_url} seed={entry.memId} size="md" />
            <ChampionNameBlock entry={entry} ctx={ctx} size="sm" />
          </div>
          <ChampionQuote text={meta?.intro_txt} />
          <div className="min-w-0">
            {/* 기록은 등번호와 같은 계기 숫자다 — 이 존에서 앰버가 붙는 자리 */}
            <div className="font-mono text-[21px] font-bold leading-none tracking-tight tabular-nums text-primary">
              {entry.record}
            </div>
            <div className="mt-1.5 truncate text-[10px] text-muted-foreground">
              {entry.raceName ?? "-"}
            </div>
          </div>
        </ChampionCard>
      ) : (
        <p className="py-3 text-[11px] text-muted-foreground">아직 기록이 없어요</p>
      )}
    </div>
  );
}

/** 마라톤 반칸 카드 — 2위부터. 대회명을 뗀 자리에 기록이 커진다 */
function MarathonHalfCard({
  entry,
  ctx,
}: {
  entry?: RankingEntry;
  ctx: BoardContext;
}) {
  if (!entry) return <div />;
  const title = ctx.memberTitles[entry.memId];
  const isMe = entry.memId === ctx.myMemId;

  return (
    // size-5(20px) + gap-1(4px) = pl-6 으로 줄 2 들여쓰기
    <CardItem
      id={isMe ? myRowId(entry.memId) : undefined}
      className={cn(
        "flex w-full min-w-0 flex-col gap-0.5 p-2",
        ROW_INTERACTIVE_CLS,
        getFrameCls(title?.frame_cd),
      )}
      {...memberRowProps(entry, ctx.onSelectMember, ctx.rowActionLabel)}
    >
      {/* 줄 1 — 순위 · 이름 · 칭호 */}
      <div className="flex min-w-0 items-center gap-1">
        <RankMark rank={entry.rank} />
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="truncate text-[13.5px] font-semibold text-foreground">{entry.name}</span>
          {title && (
            <TitleBadge
              name={title.ttl_nm}
              effect={title.badge_effect}
              size="xs"
              tooltip={{ desc: title.ttl_desc, visibility: title.desc_visibility, isHeld: title.isHeld }}
            />
          )}
        </div>
      </div>
      {/* 줄 2·3 — 대회명과 기록. 한 줄에 나란히 두면 163px에서 기록이 11px까지 눌리므로
          줄을 갈라 기록을 16px로 세운다(어느 대회 기록인지는 랭킹에서 여전히 필요한 정보다). */}
      <div className="min-w-0 pl-6">
        <div className="truncate text-[10px] leading-tight text-muted-foreground">
          {entry.raceName ?? "-"}
        </div>
        <span className="font-mono text-[16px] font-bold tracking-tight tabular-nums text-foreground">
          {entry.record}
        </span>
      </div>
    </CardItem>
  );
}

function MarathonContent({ events, ctx }: { events: MarathonEvent[]; ctx: BoardContext }) {
  const [selectedEvent, setSelectedEvent] = useState(events[0]?.eventType ?? "");

  const currentEvent = events.find((e) => e.eventType === selectedEvent);
  const male = splitChampion(currentEvent?.male ?? []);
  const female = splitChampion(currentEvent?.female ?? []);
  const maxRows = Math.max(male.rest.length, female.rest.length);
  const hasAny = (currentEvent?.male.length ?? 0) + (currentEvent?.female.length ?? 0) > 0;

  // 내 판독선은 성별과 무관하게 "내가 있는 목록"에서 잡는다 — 어느 쪽에 있든 한 곳만 맞는다.
  const standing =
    getMyTimeStanding(currentEvent?.male ?? [], ctx.myMemId) ??
    getMyTimeStanding(currentEvent?.female ?? [], ctx.myMemId);

  return (
    <>
      {/* 종목 서브탭 — 카테고리는 세그먼트라 층이 갈린다 */}
      {events.length > 1 && (
        <div className="flex gap-2 px-6">
          {events.map((evt) => (
            <Button
              key={evt.eventType}
              type="button"
              variant="ghost"
              size="xs"
              aria-pressed={selectedEvent === evt.eventType}
              onClick={() => setSelectedEvent(evt.eventType)}
              className={cn(
                "rounded-full px-3",
                selectedEvent === evt.eventType
                  ? "bg-muted-foreground/20 text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {evt.label}
            </Button>
          ))}
        </div>
      )}

      {hasAny ? (
        <>
          {/* 띠와 판독선은 한 덩이 — 사이에 간격이 생기면 판독선이 목록의 첫 행으로 읽힌다 */}
          <div className="flex flex-col">
            {/* 제호는 "Champion"이 아니다 — 이 사람은 어떤 경기에서 이긴 게 아니라 크루 안에서
                가장 빠른 기록을 갖고 있는 사람이다(그 대회에선 3,000등이었을 수도 있다).
                겨루는 자리가 아니라 친목·응원이라는 이 앱의 톤과도 승패 어휘는 어긋난다. */}
            <ChampionBand eyebrow="Record Holder">
              {/* 프레임 카드가 각 칸의 경계를 이미 그리므로 가운데 괘선은 두지 않는다 */}
              <div className="grid grid-cols-2 items-start gap-2.5">
                <MarathonChampionSlot who="MEN" entry={male.champion} ctx={ctx} />
                <MarathonChampionSlot who="WOMEN" entry={female.champion} ctx={ctx} />
              </div>
            </ChampionBand>

            {standing ? (
              <MyStandingBand
                standing={standing}
                targetId={standing.rank > 1 ? myRowId(ctx.myMemId ?? "") : undefined}
              />
            ) : (
              ctx.myMemId && <RegisterPrompt message="이 종목에 등록한 기록이 없어요" />
            )}
          </div>

          {/* 남자/여자 머리글은 두지 않는다 — 바로 위 띠가 `MEN` · `WOMEN`으로 같은 좌우 축을
              이미 세웠고, 목록도 그 축을 그대로 잇는다. 한 화면에서 같은 구분을 두 번,
              그것도 한쪽은 영문 한쪽은 한글로 말하면 두 개의 다른 구분처럼 읽힌다. */}
          {maxRows > 0 && (
            <div className="flex flex-col gap-2 px-6">
              {Array.from({ length: maxRows }).map((_, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <MarathonHalfCard entry={male.rest[i]} ctx={ctx} />
                  <MarathonHalfCard entry={female.rest[i]} ctx={ctx} />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="px-6">
          <EmptyState variant="card" message="아직 등록된 기록이 없어요. 첫 기록이 전당의 첫 줄이 됩니다." />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  트레일러닝                                                         */
/* ------------------------------------------------------------------ */

const UTMB_HELP = (
  <HelpTip title="UTMB INDEX" align="end" className="-my-2 size-8 text-muted-foreground hover:text-foreground">
    UTMB가 대회 완주 기록으로 산정하는 트레일 러너 실력 지수예요. 높을수록 상위이고, 대회를 완주할
    때마다 갱신돼요.
  </HelpTip>
);

/** @internal 렌더 테스트가 카테고리 전환 없이 이 판만 그려 보려고 꺼내 쓴다 */
export function TrailContent({ entries, ctx }: { entries: TrailEntry[]; ctx: BoardContext }) {
  const { champion, rest } = splitChampion(entries);
  const standing = getMyIndexStanding(entries, ctx.myMemId);

  if (!champion) {
    return (
      <div className="px-6">
        <EmptyState variant="card" message="아직 UTMB 프로필을 연동한 멤버가 없어요." />
      </div>
    );
  }

  return (
    <>
      {/* 성별을 나누지 않는 단일 목록이라 좌우 2열이 성립하지 않는다 — 챔피언 하나에 지수를 크게 */}
      <div className="flex flex-col">
        {/* 트레일만 제호가 갈린다 — UTMB INDEX는 기록이 아니라 지수라 "Record Holder"가 안 맞는다.
            판을 이미 셋으로 갈라 뒀으니 제호가 달라도 어색하지 않다. */}
        <ChampionBand eyebrow="Top Index" action={UTMB_HELP}>
          <ChampionCard entry={champion} ctx={ctx}>
            <div className="flex items-center gap-3">
              <Avatar
                src={ctx.memberMeta[champion.memId]?.avatar_url}
                seed={champion.memId}
                size="xl"
              />
              <ChampionNameBlock entry={champion} ctx={ctx} size="md" />
              <div className="shrink-0 text-right">
                <div className="font-mono text-[30px] font-bold leading-none tracking-tight tabular-nums text-primary">
                  {champion.utmbIndex}
                </div>
                <div className="mt-1.5 font-mono text-[8.5px] tracking-[0.18em] text-muted-foreground">
                  UTMB INDEX
                </div>
              </div>
            </div>
            <ChampionQuote text={ctx.memberMeta[champion.memId]?.intro_txt} />
            <p className="truncate text-[10px] text-muted-foreground">
              {champion.recentRaceName ?? "-"}
              {champion.recentRaceRecord ? ` · ${champion.recentRaceRecord}` : ""}
            </p>
          </ChampionCard>
        </ChampionBand>

        {standing ? (
          <MyStandingBand
            standing={standing}
            unit="지수"
            targetId={standing.rank > 1 ? myRowId(ctx.myMemId ?? "") : undefined}
          />
        ) : (
          ctx.myMemId && <RegisterPrompt message="UTMB 프로필을 연동하면 여기 순위가 보여요" />
        )}
      </div>

      <div className="flex flex-col gap-2 px-6">
        {rest.map((entry) => {
          const title = ctx.memberTitles[entry.memId];
          const isMe = entry.memId === ctx.myMemId;
          return (
            <CardItem
              key={entry.memId}
              id={isMe ? myRowId(entry.memId) : undefined}
              className={cn(
                "flex items-center gap-4 p-3",
                ROW_INTERACTIVE_CLS,
                getFrameCls(title?.frame_cd),
              )}
              {...memberRowProps(entry, ctx.onSelectMember)}
            >
              <RankMark rank={entry.rank} size="md" />

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  {entry.utmbProfileUrl ? (
                    // 이름은 UTMB 외부 프로필로 유지하고, 카드 열기는 행의 나머지 영역이 담당한다.
                    <a
                      href={entry.utmbProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="truncate text-[15px] font-semibold text-primary hover:underline"
                    >
                      {entry.name}
                    </a>
                  ) : (
                    <span className="truncate text-[15px] font-semibold text-foreground">
                      {entry.name}
                    </span>
                  )}
                  {title && (
                    <TitleBadge
                      name={title.ttl_nm}
                      effect={title.badge_effect}
                      size="xs"
                      tooltip={{ desc: title.ttl_desc, visibility: title.desc_visibility, isHeld: title.isHeld }}
                    />
                  )}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {entry.recentRaceName ?? "-"}
                </span>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-mono text-lg font-bold tabular-nums text-foreground">
                  {entry.utmbIndex}
                </span>
                <span className="text-xs text-muted-foreground">
                  {entry.recentRaceRecord ?? "-"}
                </span>
              </div>
            </CardItem>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  철인3종 — 순위가 아니라 명단                                        */
/* ------------------------------------------------------------------ */

const CHIP_CLS =
  "shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] leading-none text-muted-foreground";

/** @internal 렌더 테스트가 카테고리 전환 없이 이 판만 그려 보려고 꺼내 쓴다 */
export function TriathlonContent({ events, ctx }: { events: TriathlonEvent[]; ctx: BoardContext }) {
  const rows = flattenTriathlon(events);
  const emptySlots = getEmptyTriathlonSlots(events);

  if (rows.length === 0 && emptySlots.length === 0) {
    return (
      <div className="px-6">
        <EmptyState variant="card" message="아직 등록된 철인3종 기록이 없어요." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-6">
      {rows.map(({ chip, entry }) => {
        const title = ctx.memberTitles[entry.memId];
        return (
          <CardItem
            key={`${chip}-${entry.memId}`}
            className={cn(
              "flex items-center gap-3 p-3",
              ROW_INTERACTIVE_CLS,
              getFrameCls(title?.frame_cd),
            )}
            {...memberRowProps(entry, ctx.onSelectMember)}
          >
            <span className={CHIP_CLS}>{chip}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold text-foreground">
                  {entry.name}
                </span>
                {title && (
                  <TitleBadge
                    name={title.ttl_nm}
                    effect={title.badge_effect}
                    size="xs"
                    tooltip={{ desc: title.ttl_desc, visibility: title.desc_visibility, isHeld: title.isHeld }}
                  />
                )}
              </div>
              <span className="truncate text-xs text-muted-foreground">{entry.raceName ?? "-"}</span>
            </div>
            <span className="shrink-0 font-mono text-lg font-bold tabular-nums text-foreground">
              {entry.record}
            </span>
          </CardItem>
        );
      })}

      {/* 전당의 빈 칸은 채우라고 말한다 */}
      {emptySlots.map((slot) => (
        <CardItem key={slot.eventType} variant="dashed" className="flex items-center gap-3 p-3.5">
          <span className={CHIP_CLS}>{slot.chip}</span>
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
            아직 완주자가 없어요.
            <br />첫 완주가 전당의 첫 줄이 됩니다.
          </p>
          <Link
            href="/profile"
            className="shrink-0 rounded-full border border-primary/35 px-2.5 py-1 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            기록 등록
          </Link>
        </CardItem>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  하이록스                                                           */
/* ------------------------------------------------------------------ */

const HYROX_HELP = (
  <HelpTip title="HYROX" align="end" className="-my-2 size-8 text-muted-foreground hover:text-foreground">
    1km 달리기 8번과 스테이션 8개를 번갈아 하는 종목이에요. 대회 완주 시간으로 순위를 매기고, 스테이션
    기록은 입력한 사람만 보여요.
  </HelpTip>
);

/** 정렬 칩·제호·표에 쓰는 이름 — 총시간 + 스테이션 8개(공식 순서) */
const HYROX_SORTS: { key: HyroxSortKey; label: string }[] = [
  { key: "TOTAL", label: "총시간" },
  ...HYROX_STATIONS.map((s) => ({ key: s.code, label: s.label })),
];
const stationLabel = (code: HyroxStationCode) => HYROX_STATIONS.find((s) => s.code === code)?.label ?? code;

/** 정렬 칩 앵커 — 아래 스테이션 표에서 기준을 바꾸면 여기로 올려 보낸다(바뀐 띠가 보이게) */
const HYROX_SORT_ANCHOR = "hof-hyrox-sort";

/** 펼침 패널 앵커 */
const hyroxPanelId = (memId: string) => `hof-hyrox-panel-${memId}`;

/**
 * 정렬 칩 — 총시간 + 스테이션 8개, 가로로 흐른다.
 *
 * 부문 pill 바로 아래 두 번째 줄이라 같은 pill 모양을 쓰되 한 단계 작게 둔다. 이 부문에서 아무도 그 스테이션을
 * 안 넣었으면 칩은 서 있되 꺼진다 — 칩이 생겼다 사라지면 줄이 매번 출렁인다.
 */
function HyroxSortChips({
  value,
  enabled,
  onChange,
}: {
  value: HyroxSortKey;
  enabled: ReadonlySet<HyroxSortKey>;
  onChange: (key: HyroxSortKey) => void;
}) {
  return (
    <div id={HYROX_SORT_ANCHOR} className="flex scroll-mt-4 gap-1.5 overflow-x-auto px-6 [scrollbar-width:none]">
      {HYROX_SORTS.map((s) => {
        const on = value === s.key;
        const disabled = !enabled.has(s.key);
        return (
          <button
            key={s.key}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(s.key)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "border-primary/40 bg-primary/10 font-semibold text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
              disabled && "opacity-40",
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function GapCell({ sec }: { sec: number | null }) {
  if (sec == null) return <td className="py-1.5 text-right text-muted-foreground">—</td>;
  return (
    <td
      className={cn(
        "py-1.5 text-right font-mono tabular-nums",
        // 빠른 쪽(-)만 색을 준다 — 느린 쪽을 빨갛게 칠하면 남의 기록을 펼쳐 보는 자리가 성적표가 된다
        sec < 0 ? "text-primary" : "text-foreground",
      )}
    >
      {formatHyroxGap(sec)}
    </td>
  );
}

/**
 * 펼침 패널 — 한 사람의 스테이션 8개와 **지금 기준의** 1위·바로 위 사람과의 차이.
 *
 * 총시간 순위만으로는 "어디서 벌고 잃었나"가 안 보인다. 내 행을 펼치면 그게 곧 내 약점 지도라 별도 "내 표"를
 * 두지 않는다. 1위보다 가장 많이 잃은 스테이션 한 줄만 옅게 깔고 아래에 말로도 적는다(색만으론 이유를 모른다).
 * 행을 누르면 프로필 대신 이게 열리므로 **멤버 카드는 패널 안 버튼**으로 간다.
 */
function HyroxGapPanel({
  entry,
  gaps,
  isMe,
  onOpenCard,
}: {
  entry: HyroxViewEntry;
  gaps: HyroxGaps;
  isMe: boolean;
  onOpenCard: () => void;
}) {
  const hasSplits = gaps.rows.some((r) => r.sec != null);
  const worstRow = gaps.worst ? gaps.rows.find((r) => r.code === gaps.worst) : undefined;

  return (
    <div id={hyroxPanelId(entry.memId)} className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate text-[13.5px] font-semibold text-foreground">{entry.name}</span>
          <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">총 {entry.totalRecord}</span>
        </div>
        <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={onOpenCard}>
          멤버 카드
        </Button>
      </div>

      {hasSplits ? (
        <>
          <p className="text-[11px] text-muted-foreground">
            {gaps.leader ? (
              <>
                비교 · 1위 {gaps.leader.name}
                {gaps.above && gaps.above.memId !== gaps.leader.memId && <> · 바로 위 {gaps.above.name}</>}
              </>
            ) : (
              "이 기준 1위예요"
            )}
          </p>
          <table className="w-full table-fixed text-[12px]">
            <thead>
              <tr className="text-[10px] text-muted-foreground">
                <th className="w-[40%] pb-1 text-left font-normal">스테이션</th>
                <th className="pb-1 text-right font-normal">기록</th>
                <th className="pb-1 text-right font-normal">1위보다</th>
                <th className="pb-1 text-right font-normal">바로 위보다</th>
              </tr>
            </thead>
            <tbody>
              {gaps.rows.map((r) => (
                <tr
                  key={r.code}
                  className={cn("border-t border-border", r.code === gaps.worst && "bg-primary/[0.07]")}
                >
                  <td className="truncate py-1.5 text-foreground">{stationLabel(r.code)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-foreground">
                    {r.sec != null ? secondsToTime(r.sec) : "—"}
                  </td>
                  <GapCell sec={r.vsLeader} />
                  <GapCell sec={r.vsAbove} />
                </tr>
              ))}
            </tbody>
          </table>
          {worstRow?.vsLeader != null && (
            <p className="text-[11px] text-muted-foreground">
              1위보다 가장 많이 벌어진 곳은{" "}
              <b className="font-semibold text-foreground">{stationLabel(worstRow.code)}</b>
              <span className="ml-1 font-mono tabular-nums text-foreground">{formatHyroxGap(worstRow.vsLeader)}</span>
            </p>
          )}
        </>
      ) : (
        <p className="py-1 text-[12px] text-muted-foreground">
          스테이션 기록을 입력하지 않았어요.
          {isMe && (
            <>
              {" "}
              <Link href="/profile" className="font-semibold text-primary underline-offset-2 hover:underline">
                프로필에서 기록을 고치면
              </Link>{" "}
              채울 수 있어요.
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** 더블스 목록 행 — 2위부터. 스테이션 기준이면 큰 숫자 옆에 총시간을 작게 붙인다 */
function HyroxListRow({ entry, ctx, showTotal }: { entry: HyroxViewEntry; ctx: BoardContext; showTotal: boolean }) {
  const title = ctx.memberTitles[entry.memId];
  const isMe = entry.memId === ctx.myMemId;
  return (
    <CardItem
      id={isMe ? myRowId(entry.memId) : undefined}
      className={cn("flex items-center gap-3 p-3", ROW_INTERACTIVE_CLS, getFrameCls(title?.frame_cd))}
      {...memberRowProps(entry, ctx.onSelectMember, ctx.rowActionLabel)}
    >
      <RankMark rank={entry.rank} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold text-foreground">{entry.name}</span>
          {title && (
            <TitleBadge
              name={title.ttl_nm}
              effect={title.badge_effect}
              size="xs"
              tooltip={{ desc: title.ttl_desc, visibility: title.desc_visibility, isHeld: title.isHeld }}
            />
          )}
        </div>
        <span className="truncate text-xs text-muted-foreground">{entry.raceName ?? "-"}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="font-mono text-lg font-bold tabular-nums text-foreground">{entry.record}</span>
        {showTotal && (
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">총 {entry.totalRecord}</span>
        )}
      </div>
    </CardItem>
  );
}

/**
 * 스테이션 기준에서 그 칸을 안 넣은 사람 — 순위 없이 뒤에 흐리게 모은다.
 * 꼴찌로 세우면 "그 스테이션을 못했다"로 읽힌다. 눌러 펼치면 다른 스테이션 기록은 그대로 볼 수 있다.
 */
function HyroxMissingRow({ entry, ctx }: { entry: HyroxViewEntry; ctx: BoardContext }) {
  const isMe = entry.memId === ctx.myMemId;
  return (
    <div
      id={isMe ? myRowId(entry.memId) : undefined}
      className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 opacity-70", ROW_INTERACTIVE_CLS)}
      {...memberRowProps(entry, ctx.onSelectMember, ctx.rowActionLabel)}
    >
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{entry.name}</span>
      <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">총 {entry.totalRecord}</span>
    </div>
  );
}

/**
 * 스테이션별 팀 최고 — 8줄 × (남·여 | 더블스 1칸). 줄을 누르면 그 스테이션 기준으로 판이 바뀐다.
 *
 * 1위끼리만 나란히 놓던 옛 표는 "볼 게 별로 없다"는 피드백을 받았다 — 총시간 1위가 모든 스테이션에서
 * 빠른 건 아니라서, 스테이션마다 주인이 갈리는 게 이 종목을 구경하는 재미다. 제호는 승패 어휘를 피해
 * `STATION BEST`로 둔다(§기강의 전당 — RECORD HOLDER와 같은 이유).
 * 아무도 스플릿을 안 넣었으면 표째 안 그린다.
 */
function HyroxStationBest({
  columns,
  current,
  onPick,
}: {
  columns: { key: string; label: string; holders: Record<HyroxStationCode, HyroxStationHolder | null> }[];
  current: HyroxSortKey;
  onPick: (code: HyroxStationCode) => void;
}) {
  const any = columns.some((c) => Object.values(c.holders).some(Boolean));
  if (!any) return null;

  return (
    <div className="flex flex-col gap-2 px-6">
      <BoardRowLabel label="STATION BEST" />
      <div className="flex flex-col">
        <div className="flex gap-2 pb-1 text-[10px] text-muted-foreground">
          <span className="w-[34%] shrink-0">스테이션</span>
          {columns.map((c) => (
            <span key={c.key} className="min-w-0 flex-1 text-right">
              {c.label}
            </span>
          ))}
        </div>
        {HYROX_STATIONS.map((st) => {
          const disabled = columns.every((c) => !c.holders[st.code]);
          return (
            <button
              key={st.code}
              type="button"
              disabled={disabled}
              aria-pressed={current === st.code}
              aria-label={`${st.label} 기준으로 보기`}
              onClick={() => onPick(st.code)}
              className={cn(
                "flex items-center gap-2 border-t border-border py-1.5 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                current === st.code ? "bg-primary/[0.07]" : "hover:bg-muted/40",
              )}
            >
              <span className="w-[34%] shrink-0 truncate">
                <span className="text-foreground">{st.label}</span>
                <span className="ml-1 text-[10px] text-muted-foreground">{st.spec}</span>
              </span>
              {columns.map((c) => {
                const h = c.holders[st.code];
                return (
                  <span key={c.key} className="flex min-w-0 flex-1 items-baseline justify-end gap-1">
                    {h ? (
                      <>
                        <span className="truncate text-muted-foreground">{h.name}</span>
                        <span className="shrink-0 font-mono font-semibold tabular-nums text-foreground">
                          {secondsToTime(h.sec)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type HyroxListKey = "male" | "female" | "all";

/**
 * 하이록스 판 — 부문 pill [오픈 · 프로 · 더블스] + 정렬 칩 [총시간 · 스테이션 8개].
 *
 * 오픈·프로는 남녀 규정(무게)이 달라 마라톤과 **같은 판**(MEN/WOMEN 띠 + 반칸 목록)을 쓴다 — 부품도 그대로
 * 재사용한다(따로 만들면 띠·판독선 규칙이 한쪽만 고쳐진다). 더블스는 남·여·혼성 팀이 섞이는 팀 기록이라
 * 트레일처럼 챔피언 하나 + 단일 목록이다. 릴레이는 판이 없다(`HYROX_DIVISIONS`).
 *
 * "구경하러 들어오는 화면"이 목표다(사용자 피드백 — 총시간 순위만 보이고 남의 스테이션 기록은 못 봤다):
 * - **정렬 칩**: 스테이션을 고르면 띠·판독선·목록이 전부 그 스테이션 기준으로 다시 선다.
 * - **행을 누르면 펼친다**: 그 사람의 8개 스테이션과 지금 기준 1위·바로 위와의 차이. 멤버 카드는 패널 안 버튼.
 *   마라톤 판과 달리 행이 프로필을 열지 않는다 — 이 판에서 사람을 누르는 이유가 기록을 보려는 거라서.
 * - **STATION BEST**: 스테이션마다 팀 최고 보유자. 줄을 누르면 그 스테이션 기준으로.
 *
 * @internal 렌더 테스트가 카테고리 전환 없이 이 판만 그려 보려고 꺼내 쓴다
 */
export function HyroxContent({
  boards,
  ctx,
  initialSort = "TOTAL",
  initialExpanded = null,
}: {
  boards: HyroxBoard[];
  ctx: BoardContext;
  /** @internal 렌더 테스트용 — 정적 렌더는 클릭을 못 하므로 시작 상태를 넘긴다 */
  initialSort?: HyroxSortKey;
  /** @internal 렌더 테스트용 */
  initialExpanded?: string | null;
}) {
  const [selected, setSelected] = useState(boards[0]?.eventType ?? "");
  const [sortKey, setSortKey] = useState<HyroxSortKey>(initialSort);
  const [expanded, setExpanded] = useState<string | null>(initialExpanded);
  const board = boards.find((b) => b.eventType === selected) ?? boards[0];

  const lists: Record<HyroxListKey, HyroxEntry[]> = {
    male: board?.male ?? [],
    female: board?.female ?? [],
    all: board?.all ?? [],
  };
  const everyone = [...lists.male, ...lists.female, ...lists.all];
  const hasAny = everyone.length > 0;

  // 부문을 바꿨는데 고른 스테이션이 그 부문엔 아무도 없으면 총시간으로 물러난다(빈 판을 세우지 않게)
  const enabled = new Set<HyroxSortKey>([
    "TOTAL",
    ...HYROX_STATION_CODES.filter((code) => hasHyroxStation(everyone, code)),
  ]);
  const sort: HyroxSortKey = enabled.has(sortKey) ? sortKey : "TOTAL";
  const isStation = sort !== "TOTAL";

  const views: Record<HyroxListKey, HyroxView> = {
    male: viewHyroxBy(lists.male, sort),
    female: viewHyroxBy(lists.female, sort),
    all: viewHyroxBy(lists.all, sort),
  };

  // 스테이션 기준이면 대회명 자리에 총시간을 앞세운다 — 큰 숫자가 총시간이 아니라는 걸 그 줄이 말한다
  const show = (e: HyroxViewEntry): HyroxViewEntry =>
    isStation ? { ...e, raceName: `총 ${e.totalRecord} · ${e.raceName ?? "-"}` } : e;

  const male = splitChampion(views.male.ranked.map(show));
  const female = splitChampion(views.female.ranked.map(show));
  const all = splitChampion(views.all.ranked.map(show));
  const missing = board?.byGender ? [...views.male.missing, ...views.female.missing] : views.all.missing;

  const hctx: BoardContext = {
    ...ctx,
    onSelectMember: (memId) => setExpanded((prev) => (prev === memId ? null : memId)),
    rowActionLabel: "스테이션 기록 펼치기",
  };

  const myView = (["male", "female", "all"] as const).map((k) => views[k]).find((v) =>
    [...v.ranked, ...v.missing].some((e) => e.memId === ctx.myMemId),
  );
  const standing = myView ? getMyTimeStanding(myView.ranked, ctx.myMemId) : null;
  const myMissing = !!myView && !standing;

  /** 펼친 사람의 패널 — 그 사람이 든 목록을 찾아 격차를 잰다 */
  const panelFor = (memId: string) => {
    if (expanded !== memId) return null;
    for (const v of Object.values(views)) {
      const entry = [...v.ranked, ...v.missing].find((e) => e.memId === memId);
      if (!entry) continue;
      const gaps = hyroxSplitGaps(v, memId);
      if (!gaps) return null;
      return (
        <HyroxGapPanel
          entry={entry}
          gaps={gaps}
          isMe={memId === ctx.myMemId}
          onOpenCard={() => ctx.onSelectMember(entry.memId, entry.name)}
        />
      );
    }
    return null;
  };

  const championPanel =
    (male.champion && panelFor(male.champion.memId)) ||
    (female.champion && panelFor(female.champion.memId)) ||
    (all.champion && panelFor(all.champion.memId));

  const pickStation = (code: HyroxStationCode) => {
    setSortKey(code);
    document.getElementById(HYROX_SORT_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const bestColumns = board?.byGender
    ? [
        { key: "m", label: "남자", holders: hyroxStationHolders(lists.male) },
        { key: "f", label: "여자", holders: hyroxStationHolders(lists.female) },
      ]
    : [{ key: "a", label: "팀 최고", holders: hyroxStationHolders(lists.all) }];

  const pairs = Math.max(male.rest.length, female.rest.length);

  return (
    <>
      <div className="flex gap-2 px-6">
        {boards.map((b) => (
          <Button
            key={b.eventType}
            type="button"
            variant="ghost"
            size="xs"
            aria-pressed={board?.eventType === b.eventType}
            onClick={() => {
              setSelected(b.eventType);
              setExpanded(null);
            }}
            className={cn(
              "rounded-full px-3",
              board?.eventType === b.eventType ? "bg-muted-foreground/20 text-foreground" : "text-muted-foreground",
            )}
          >
            {b.label}
          </Button>
        ))}
      </div>

      {!board || !hasAny ? (
        <div className="px-6">
          <EmptyState
            variant="card"
            message="아직 등록된 하이록스 기록이 없어요. 첫 완주가 전당의 첫 줄이 됩니다."
          />
        </div>
      ) : (
        <>
          <HyroxSortChips value={sort} enabled={enabled} onChange={setSortKey} />

          <div className="flex flex-col">
            <ChampionBand
              eyebrow={isStation ? sort.replaceAll("_", " ") : "Record Holder"}
              action={HYROX_HELP}
            >
              {board.byGender ? (
                <div className="grid grid-cols-2 items-start gap-2.5">
                  <MarathonChampionSlot who="MEN" entry={male.champion} ctx={hctx} />
                  <MarathonChampionSlot who="WOMEN" entry={female.champion} ctx={hctx} />
                </div>
              ) : (
                all.champion && (
                  <ChampionCard entry={all.champion} ctx={hctx}>
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={ctx.memberMeta[all.champion.memId]?.avatar_url}
                        seed={all.champion.memId}
                        size="xl"
                      />
                      <ChampionNameBlock entry={all.champion} ctx={ctx} size="md" />
                      <div className="shrink-0 text-right font-mono text-[24px] font-bold leading-none tracking-tight tabular-nums text-primary">
                        {all.champion.record}
                      </div>
                    </div>
                    <ChampionQuote text={ctx.memberMeta[all.champion.memId]?.intro_txt} />
                    <p className="truncate text-[10px] text-muted-foreground">{all.champion.raceName ?? "-"}</p>
                  </ChampionCard>
                )
              )}
            </ChampionBand>

            {standing ? (
              <MyStandingBand
                standing={standing}
                targetId={standing.rank > 1 ? myRowId(ctx.myMemId ?? "") : undefined}
                onGo={() => setExpanded(ctx.myMemId)}
              />
            ) : myMissing ? (
              <RegisterPrompt message="이 스테이션 기록을 입력하지 않았어요" linkLabel="기록 수정" />
            ) : (
              ctx.myMemId && <RegisterPrompt message="이 부문에 등록한 기록이 없어요" />
            )}
          </div>

          {championPanel && <div className="px-6">{championPanel}</div>}

          {board.byGender
            ? pairs > 0 && (
                <div className="flex flex-col gap-2 px-6">
                  {Array.from({ length: pairs }).map((_, i) => {
                    const m = male.rest[i];
                    const f = female.rest[i];
                    const panel = (m && panelFor(m.memId)) || (f && panelFor(f.memId));
                    return (
                      <div key={i} className="flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <MarathonHalfCard entry={m} ctx={hctx} />
                          <MarathonHalfCard entry={f} ctx={hctx} />
                        </div>
                        {panel}
                      </div>
                    );
                  })}
                </div>
              )
            : all.rest.length > 0 && (
                <div className="flex flex-col gap-2 px-6">
                  {all.rest.map((entry) => (
                    <div key={entry.memId} className="flex flex-col gap-2">
                      <HyroxListRow entry={entry} ctx={hctx} showTotal={isStation} />
                      {panelFor(entry.memId)}
                    </div>
                  ))}
                </div>
              )}

          {missing.length > 0 && (
            <div className="flex flex-col gap-1 px-6">
              <BoardRowLabel label={`스테이션 기록 미입력 ${missing.length}명`} />
              {missing.map((entry) => (
                <div key={entry.memId} className="flex flex-col gap-2">
                  <HyroxMissingRow entry={entry} ctx={hctx} />
                  {panelFor(entry.memId)}
                </div>
              ))}
            </div>
          )}

          <HyroxStationBest columns={bestColumns} current={sort} onPick={pickStation} />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  메인 컴포넌트                                                       */
/* ------------------------------------------------------------------ */

export function RecordsClient({
  data,
  myTitleNames = [],
  myMemId = null,
  teamId,
}: {
  data: RecordsData;
  myTitleNames?: string[];
  myMemId?: string | null;
  teamId: string;
}) {
  const myTitleNameSet = new Set(myTitleNames);
  const [selectedMember, setSelectedMember] = useState<{ memId: string; name: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>("marathon");

  // memberTitles에 isHeld 주입
  const memberTitles: Record<string, MemberTitle> = Object.fromEntries(
    Object.entries(data.memberTitles).map(([memId, t]) => [
      memId,
      { ...t, isHeld: myTitleNameSet.has(t.ttl_nm) },
    ]),
  );

  const ctx: BoardContext = {
    memberTitles,
    memberMeta: data.memberMeta ?? {},
    myMemId,
    onSelectMember: (memId, name) => setSelectedMember({ memId, name }),
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 카테고리 — 세그먼트. 아래 종목 서브탭이 pill이라 두 층이 형태로 갈린다 */}
      <div className="px-6">
        <SegmentControl
          segments={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          value={selectedCategory}
          onValueChange={(v) => setSelectedCategory(v as CategoryKey)}
        />
      </div>

      {selectedCategory === "marathon" && (
        <MarathonContent events={data.marathon.events} ctx={ctx} />
      )}
      {selectedCategory === "trail" && <TrailContent entries={data.trail.entries} ctx={ctx} />}
      {selectedCategory === "hyrox" && <HyroxContent boards={data.hyrox?.boards ?? []} ctx={ctx} />}
      {selectedCategory === "triathlon" && (
        <TriathlonContent events={data.triathlon.events} ctx={ctx} />
      )}

      <MemberCardDialog
        memId={selectedMember?.memId ?? null}
        memNm={selectedMember?.name}
        teamId={teamId}
        open={selectedMember !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedMember(null);
        }}
      />
    </div>
  );
}
