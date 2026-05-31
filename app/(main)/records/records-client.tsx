"use client";

import { useState } from "react";

import { Medal, Search } from "lucide-react";

import { getFrameCls } from "@/lib/title-effects";
import { cn } from "@/lib/utils";

import { TitleBadge } from "@/components/common/title-badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* ------------------------------------------------------------------ */
/*  타입 정의                                                          */
/* ------------------------------------------------------------------ */

type DescVisibility = "always" | "others" | "held" | "never";
type MemberTitle = { ttl_nm: string; ttl_desc: string | null; desc_visibility: DescVisibility; badge_effect: string; frame_cd: string; isHeld: boolean };

type RankingEntry = {
  rank: number;
  memId: string;
  name: string;
  record: string;
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
  raceName: string | null;
  isMain: boolean;
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
  memberTitles: Record<string, MemberTitle>;
};

/* ------------------------------------------------------------------ */
/*  카테고리 탭 정의                                                    */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  { key: "marathon", label: "마라톤" },
  { key: "trail", label: "트레일러닝" },
  { key: "triathlon", label: "철인3종" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

/* ------------------------------------------------------------------ */
/*  MedalBadge                                                        */
/* ------------------------------------------------------------------ */

function MedalBadge({ rank }: { rank: number }) {
  const color: Record<number, string> = {
    1: "text-amber-500",
    2: "text-slate-400",
    3: "text-amber-700",
  };
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/40",
        color[rank],
      )}
      title={`${rank}등`}
    >
      <Medal className="size-5" strokeWidth={2} />
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) return <MedalBadge rank={rank} />;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center text-xl font-bold text-muted-foreground">
      {rank}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  빈 상태                                                            */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      아직 등록된 기록이 없습니다.
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  마라톤 — 반칸 카드 (남/여 각각 flex-1)                               */
/* ------------------------------------------------------------------ */

const MEDAL_COLOR: Record<number, string> = {
  1: "text-amber-500",
  2: "text-slate-400",
  3: "text-amber-700",
};

function MarathonHalfCard({
  entry,
  memberTitles,
}: {
  entry?: RankingEntry;
  memberTitles: Record<string, MemberTitle>;
}) {
  if (!entry) return <div />;
  const title = memberTitles[entry.memId];
  const frameCls = getFrameCls(title?.frame_cd);

  const rankEl =
    entry.rank <= 3 ? (
      <div
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted/60",
          MEDAL_COLOR[entry.rank],
        )}
      >
        <Medal className="size-3" strokeWidth={2.5} />
      </div>
    ) : (
      <span className="flex size-5 shrink-0 items-center justify-center text-[11px] font-bold text-muted-foreground">
        {entry.rank}
      </span>
    );

  return (
    // size-5 (20px) + gap-1 (4px) = pl-6 으로 줄 2 들여쓰기
    <CardItem className={cn("flex min-w-0 w-full flex-col gap-0.5 p-2", frameCls)}>
      {/* 줄 1 — 순위 · 이름 · 칭호 */}
      <div className="flex min-w-0 items-center gap-1">
        {rankEl}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="truncate text-[12px] font-semibold text-foreground">
            {entry.name}
          </span>
          {title && (
            <TitleBadge name={title.ttl_nm} effect={title.badge_effect} size="xs" tooltip={{ desc: title.ttl_desc, visibility: title.desc_visibility as "always" | "others" | "held" | "never", isHeld: title.isHeld, isOwner: false }} />
          )}
        </div>
      </div>
      {/* 줄 2 — 대회명(말줄임) · 기록 */}
      <div className="flex min-w-0 items-center gap-1 pl-6">
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
          {entry.raceName ?? "-"}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-[11px] font-bold",
            entry.rank === 1 ? "text-primary" : "text-foreground",
          )}
        >
          {entry.record}
        </span>
      </div>
    </CardItem>
  );
}

/* ------------------------------------------------------------------ */
/*  마라톤 탭 콘텐츠                                                    */
/* ------------------------------------------------------------------ */

function MarathonContent({
  events,
  memberTitles,
}: {
  events: MarathonEvent[];
  memberTitles: Record<string, MemberTitle>;
}) {
  const [selectedEvent, setSelectedEvent] = useState(events[0]?.eventType ?? "");

  const currentEvent = events.find((e) => e.eventType === selectedEvent);
  const maxRows = Math.max(
    currentEvent?.male.length ?? 0,
    currentEvent?.female.length ?? 0,
  );

  return (
    <>
      {/* 종목 서브탭 */}
      {events.length > 1 && (
        <div className="flex gap-2 px-6">
          {events.map((evt) => (
            <Button
              key={evt.eventType}
              type="button"
              variant="ghost"
              size="xs"
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

      {/* 헤더 + 본문 */}
      <div className="flex flex-col gap-1.5 px-6">
        <div className="grid grid-cols-2 gap-2">
          <span className="text-center text-[11px] font-semibold text-muted-foreground">남자</span>
          <span className="text-center text-[11px] font-semibold text-muted-foreground">여자</span>
        </div>
        <div className="flex flex-col gap-2">
          {maxRows === 0 ? (
            <EmptyState />
          ) : (
            Array.from({ length: maxRows }).map((_, i) => {
              const male = currentEvent?.male[i];
              const female = currentEvent?.female[i];
              return (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <MarathonHalfCard entry={male} memberTitles={memberTitles} />
                  <MarathonHalfCard entry={female} memberTitles={memberTitles} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  트레일러닝 탭 콘텐츠                                                */
/* ------------------------------------------------------------------ */

function TrailContent({
  entries,
  memberTitles,
}: {
  entries: TrailEntry[];
  memberTitles: Record<string, MemberTitle>;
}) {
  if (entries.length === 0) {
    return (
      <div className="px-6">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-6 pt-2">
      {entries.map((entry) => {
        const title = memberTitles[entry.memId];
        const frameCls = getFrameCls(title?.frame_cd);
        return (
          <CardItem
            key={`t-${entry.rank}-${entry.name}`}
            className={cn("flex items-center gap-4 p-3", frameCls)}
          >
            <RankBadge rank={entry.rank} />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {entry.utmbProfileUrl ? (
                  <a
                    href={entry.utmbProfileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[15px] font-semibold text-primary hover:underline"
                  >
                    {entry.name}
                  </a>
                ) : (
                  <span className="text-[15px] font-semibold text-foreground">
                    {entry.name}
                  </span>
                )}
                {title && (
                  <TitleBadge
                    name={title.ttl_nm}
                    effect={title.badge_effect}
                    size="xs"
                    tooltip={{ desc: title.ttl_desc, visibility: title.desc_visibility as "always" | "others" | "held" | "never", isHeld: title.isHeld, isOwner: false }}
                  />
                )}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {entry.recentRaceName ?? "-"}
              </span>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span
                className={cn(
                  "font-mono text-lg font-bold",
                  entry.rank === 1 ? "text-primary" : "text-foreground",
                )}
              >
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
  );
}

/* ------------------------------------------------------------------ */
/*  철인3종 탭 콘텐츠                                                   */
/* ------------------------------------------------------------------ */

function TriathlonContent({
  events,
  memberTitles,
}: {
  events: TriathlonEvent[];
  memberTitles: Record<string, MemberTitle>;
}) {
  const hasAny = events.some((e) => e.entries.length > 0);

  if (!hasAny) {
    return (
      <div className="px-6">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 pt-2">
      {events.map((evt) => {
        if (evt.entries.length === 0) return null;

        return (
          <div key={evt.eventType} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
              {evt.label}
            </h3>
            {evt.entries.map((entry) => {
              const title = memberTitles[entry.memId];
              const frameCls = getFrameCls(title?.frame_cd);
              return (
                <CardItem
                  key={`tri-${entry.rank}-${entry.name}`}
                  className={cn("flex items-center gap-4 p-3", frameCls)}
                >
                  <RankBadge rank={entry.rank} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-foreground">
                        {entry.name}
                      </span>
                      {title && (
                        <TitleBadge
                          name={title.ttl_nm}
                          effect={title.badge_effect}
                          size="xs"
                          tooltip={{ desc: title.ttl_desc, visibility: title.desc_visibility, isHeld: title.isHeld, isOwner: false }}
                        />
                      )}
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {entry.raceName ?? "-"}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-lg font-bold",
                      entry.rank === 1 ? "text-primary" : "text-foreground",
                    )}
                  >
                    {entry.record}
                  </span>
                </CardItem>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  메인 컴포넌트                                                       */
/* ------------------------------------------------------------------ */

export function RecordsClient({ data, myTitleNames = [] }: { data: RecordsData; myTitleNames?: string[] }) {
  const myTitleNameSet = new Set(myTitleNames);

  // memberTitles에 isHeld 주입
  const memberTitles: Record<string, MemberTitle> = Object.fromEntries(
    Object.entries(data.memberTitles).map(([memId, t]) => [
      memId,
      { ...t, isHeld: myTitleNameSet.has(t.ttl_nm) },
    ])
  );
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryKey>("marathon");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const filteredMarathon = {
    events: data.marathon.events.map((evt) => ({
      ...evt,
      male: evt.male.filter((e) => e.name.toLowerCase().includes(q)),
      female: evt.female.filter((e) => e.name.toLowerCase().includes(q)),
    })),
  };

  const filteredTrail = {
    entries: data.trail.entries.filter((e) =>
      e.name.toLowerCase().includes(q),
    ),
  };

  const filteredTriathlon = {
    events: data.triathlon.events.map((evt) => ({
      ...evt,
      entries: evt.entries.filter((e) => e.name.toLowerCase().includes(q)),
    })),
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 카테고리 탭 */}
      <div className="flex gap-2 px-6">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.key}
            type="button"
            size="sm"
            onClick={() => setSelectedCategory(cat.key)}
            className={cn(
              "rounded-full px-4 text-[13px] font-medium",
              selectedCategory === cat.key
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-[1.5px] border-border bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground",
            )}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* 검색창 */}
      <div className="relative px-6">
        <Search className="absolute left-9 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름으로 검색"
          className="pl-9"
        />
      </div>

      {/* 카테고리별 콘텐츠 */}
      {selectedCategory === "marathon" && (
        <MarathonContent events={filteredMarathon.events} memberTitles={memberTitles} />
      )}
      {selectedCategory === "trail" && (
        <TrailContent entries={filteredTrail.entries} memberTitles={memberTitles} />
      )}
      {selectedCategory === "triathlon" && (
        <TriathlonContent events={filteredTriathlon.events} memberTitles={memberTitles} />
      )}
    </div>
  );
}
