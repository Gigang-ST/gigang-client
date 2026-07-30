"use client";

import { useState } from "react";

import Link from "next/link";

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
function memberRowProps(entry: { memId: string; name: string }, onSelect: SelectMember) {
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
    "aria-label": `${entry.name} 프로필 보기`,
  };
}

/** 행 진입점 공통 스타일 — 탭 가능함을 드러내고 키보드 포커스를 보이게 한다 */
const ROW_INTERACTIVE_CLS =
  "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/** 스크린 존 안의 진입점 — 흰 지면용 ring 색은 board 위에서 보이지 않는다 */
const BOARD_INTERACTIVE_CLS =
  "cursor-pointer transition-colors hover:bg-board-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-board-amber";

/** 내 행으로 보내는 앵커 id — 판독선이 이걸 찾아 스크롤한다 */
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
  memberTitles: Record<string, MemberTitleBase>;
  memberMeta: Record<string, MemberMeta>;
};

/** 세 판이 공통으로 들고 다니는 표면 — prop 목록이 함수마다 길어지는 걸 막는다 */
export type BoardContext = {
  memberTitles: Record<string, MemberTitle>;
  memberMeta: Record<string, MemberMeta>;
  myMemId: string | null;
  onSelectMember: SelectMember;
};

/* ------------------------------------------------------------------ */
/*  카테고리 탭 정의                                                    */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  { value: "marathon", label: "마라톤" },
  { value: "trail", label: "트레일러닝" },
  { value: "triathlon", label: "철인3종" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["value"];

/* ------------------------------------------------------------------ */
/*  순위 표시                                                          */
/* ------------------------------------------------------------------ */

/**
 * 등수 표시 — **숫자가 정보를 지고 색은 거든다.**
 *
 * 예전엔 1~3위를 같은 메달 아이콘에 색만 달리해 구분했다. 색각 이상이면 셋이 같고
 * 다크 테마에선 동메달이 배경에 묻었다. 1위는 이제 board 띠로 올라가므로 여기 남는 건 2·3위다.
 */
/**
 * 시상대 표시 — 은·동은 **어두운 메달 칩 위에 메탈릭 shimmer 숫자**.
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
/*  스크린 존 — 챔피언 띠 + 내 기록 판독선                              */
/* ------------------------------------------------------------------ */

/**
 * 전당의 스크린 존.
 *
 * 화면 좌우 끝까지 붙는 어두운 띠다 — glow를 쓰는 칭호 프레임·배지는 흰 지면에서 빛나지 않고
 * 뿌옇게 번지기만 한다(§DESIGN.md Board 토큰). 흰 지면 중간에 떠 있는 검은 상자는 광고 배너로
 * 읽히지만, 지면을 가로지르는 띠는 끼워 넣은 계기 출력물로 읽힌다.
 *
 * 프로필 카드 팝업과 달리 점등(flicker·cone)은 켜지 않는다 — 탭은 매번 들어오는 자리라
 * 진입할 때마다 깜빡이면 피곤하다(편집판이 플리커를 끈 것과 같은 이유).
 */
function BoardBand({ eyebrow, action, children }: { eyebrow: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 bg-board px-6 pb-4 pt-3.5 text-board-foreground">
      <div className="flex items-center justify-between">
        {/* 전당의 제호다 — 앰버 대신 칭호 이펙트의 금빛 shimmer를 그대로 쓰되, `.hof-masthead`로
            훑는 속도를 5s → 16s로 죽인다. 배지 크기에 맞춘 속도를 제호에 그대로 쓰면 번쩍인다. */}
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
          "min-w-0 truncate font-semibold text-board-foreground",
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
    <p className="line-clamp-2 min-h-[30px] text-[11px] leading-snug text-board-muted">
      {text && (
        <>
          <span aria-hidden className="text-board-amber/70">&ldquo;</span>
          {text}
          <span aria-hidden className="text-board-amber/70">&rdquo;</span>
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
 * 블록에 두르면 전부 켜지고 이펙트가 그만큼 크게 보인다(§`.board-frame-host` — 존 안에서
 * 카드 바탕을 board로 바꿔 흰 판이 뜨는 걸 막는다).
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
        "board-frame-host flex min-w-0 flex-col gap-1.5 rounded-2xl border border-board-line p-2.5",
        BOARD_INTERACTIVE_CLS,
        getFrameCls(title?.frame_cd),
      )}
      {...memberRowProps(entry, ctx.onSelectMember)}
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
}: {
  standing: MyStanding;
  /** 값 뒤에 붙는 말 — 시간 종목은 없고 트레일은 "지수" */
  unit?: string;
  /** 목록 안 내 행의 앵커. 내가 1위면 목록에 없으므로 준 쪽만 버튼이 된다 */
  targetId?: string;
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
          1위까지{" "}
          <b className="font-mono font-bold tabular-nums text-foreground">{standing.gap}</b>
        </span>
      )}
    </>
  );

  const cls =
    "flex w-full items-center gap-2 border-b border-border bg-primary/[0.07] px-6 py-2 text-left";

  if (!targetId) return <div className={cls}>{body}</div>;

  return (
    <button
      type="button"
      onClick={() =>
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
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
function RegisterPrompt({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-6 py-2">
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{message}</span>
      <Link
        href="/profile"
        className="shrink-0 rounded-full border border-primary/35 px-2.5 py-1 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        기록 등록
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
      <span className="shrink-0 font-mono text-[9px] tracking-[0.2em] text-board-muted">
        {label}
      </span>
      <span aria-hidden className="h-px flex-1 bg-board-line" />
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
            <div className="font-mono text-[21px] font-bold leading-none tracking-tight tabular-nums text-board-amber">
              {entry.record}
            </div>
            <div className="mt-1.5 truncate text-[10px] text-board-muted">
              {entry.raceName ?? "-"}
            </div>
          </div>
        </ChampionCard>
      ) : (
        <p className="py-3 text-[11px] text-board-muted">아직 기록이 없어요</p>
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
        isMe && "border-primary/45 bg-primary/[0.05]",
      )}
      {...memberRowProps(entry, ctx.onSelectMember)}
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
            <BoardBand eyebrow="Record Holder">
              {/* 프레임 카드가 각 칸의 경계를 이미 그리므로 가운데 괘선은 두지 않는다 */}
              <div className="grid grid-cols-2 items-start gap-2.5">
                <MarathonChampionSlot who="MEN" entry={male.champion} ctx={ctx} />
                <MarathonChampionSlot who="WOMEN" entry={female.champion} ctx={ctx} />
              </div>
            </BoardBand>

            {standing ? (
              <MyStandingBand
                standing={standing}
                targetId={standing.rank > 1 ? myRowId(ctx.myMemId ?? "") : undefined}
              />
            ) : (
              ctx.myMemId && <RegisterPrompt message="이 종목에 등록한 기록이 없어요" />
            )}
          </div>

          {/* 챔피언뿐이면(양쪽 다 1명) 목록이 통째로 빈다 — 남자/여자 머리글만 남겨 두지 않는다 */}
          {maxRows > 0 && (
            <div className="flex flex-col gap-1.5 px-6">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-center text-[11px] font-semibold text-muted-foreground">남자</span>
                <span className="text-center text-[11px] font-semibold text-muted-foreground">여자</span>
              </div>
              <div className="flex flex-col gap-2">
                {Array.from({ length: maxRows }).map((_, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <MarathonHalfCard entry={male.rest[i]} ctx={ctx} />
                    <MarathonHalfCard entry={female.rest[i]} ctx={ctx} />
                  </div>
                ))}
              </div>
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
  <HelpTip title="UTMB INDEX" align="end" className="-my-2 size-8 text-board-muted hover:text-board-foreground">
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
        <BoardBand eyebrow="Top Index" action={UTMB_HELP}>
          <ChampionCard entry={champion} ctx={ctx}>
            <div className="flex items-center gap-3">
              <Avatar
                src={ctx.memberMeta[champion.memId]?.avatar_url}
                seed={champion.memId}
                size="xl"
              />
              <ChampionNameBlock entry={champion} ctx={ctx} size="md" />
              <div className="shrink-0 text-right">
                <div className="font-mono text-[30px] font-bold leading-none tracking-tight tabular-nums text-board-amber">
                  {champion.utmbIndex}
                </div>
                <div className="mt-1.5 font-mono text-[8.5px] tracking-[0.18em] text-board-muted">
                  UTMB INDEX
                </div>
              </div>
            </div>
            <ChampionQuote text={ctx.memberMeta[champion.memId]?.intro_txt} />
            <p className="truncate text-[10px] text-board-muted">
              {champion.recentRaceName ?? "-"}
              {champion.recentRaceRecord ? ` · ${champion.recentRaceRecord}` : ""}
            </p>
          </ChampionCard>
        </BoardBand>

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
                isMe && "border-primary/45 bg-primary/[0.05]",
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
        const isMe = entry.memId === ctx.myMemId;
        return (
          <CardItem
            key={`${chip}-${entry.memId}`}
            className={cn(
              "flex items-center gap-3 p-3",
              ROW_INTERACTIVE_CLS,
              getFrameCls(title?.frame_cd),
              isMe && "border-primary/45 bg-primary/[0.05]",
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
