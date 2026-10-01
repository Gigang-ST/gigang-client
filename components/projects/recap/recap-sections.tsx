import Image from "next/image";
import Link from "next/link";

import { Avatar } from "@/components/common/avatar";
import { H1 } from "@/components/common/typography";
import { StatCard } from "@/components/common/stat-card";
import { StoryZoneHeader } from "@/components/story/story-zone-header";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { dayjs, formatKST } from "@/lib/dayjs";
import {
  RECAP_EMOJI,
  RECAP_MEMORY_WINNER_MAX,
  formatRecapKm,
  formatRecapNumber,
  formatTimes,
  type MileageRecap,
  type RecapMember,
  type RecapMemory,
} from "@/lib/mileage-recap";
import type { RecapParty } from "@/lib/mileage-recap-seasons";
import { SPORT_EMOJI, type SportCode } from "@/lib/sport";
import { cn } from "@/lib/utils";

import { RecapMemories } from "./recap-memories";
import { RecapMemoryCard, RecapMemorySnippet } from "./recap-memory-card";
import { RecapOdometer } from "./recap-odometer";
import { RecapReveal } from "./recap-reveal";

import type { CSSProperties, ReactNode } from "react";

/** 돌아보기 본문이 쓰는 모양 — 사람별 집계(`members`)는 뺀다(내 것만 따로 받는다) */
export type RecapView = Omit<MileageRecap, "members">;

/*
 * 말투 — 크루 단톡방에서 시즌을 돌아보며 하는 말처럼 쓴다(해요체, 짧게).
 * 기사체("~하다")·비유("원정대", "되감는")·설명체("부문마다", "기준")는 쓰지 않는다.
 * 숫자 옆엔 그 숫자가 뭔지 한 번에 알 말만 붙인다.
 */

/* ------------------------------------------------------------------ */
/*  공통                                                                */
/* ------------------------------------------------------------------ */

/** 존 하나 — 괘선 헤더(기강이야기와 같은 어법) + 본문. 화면에 들어올 때 올라온다 */
function Zone({
  label,
  lead,
  children,
  bleed = false,
  className,
}: {
  label: string;
  lead?: ReactNode;
  children: ReactNode;
  /** 본문이 화면 끝까지(가로 스크롤) — 헤더만 지면 여백을 잡는다 */
  bleed?: boolean;
  className?: string;
}) {
  return (
    <RecapReveal className={cn(!bleed && "px-6", className)}>
      <StoryZoneHeader label={label} lead={lead} bleed={bleed} />
      <div className="mt-5">{children}</div>
    </RecapReveal>
  );
}

const mdKo = (date: string) => dayjs(date).format("M월 D일");

/** 종목 색 — 토큰만(§DESIGN 종목). Tailwind가 읽을 수 있게 클래스 문자열을 통째로 둔다 */
const SPORT_BG: Record<SportCode, string> = {
  RUNNING: "bg-sport-road-run",
  TRAIL: "bg-sport-trail-run",
  CYCLING: "bg-sport-cycling",
  SWIMMING: "bg-sport-triathlon",
};

/* ------------------------------------------------------------------ */
/*  제호 + 히어로                                                        */
/* ------------------------------------------------------------------ */

export function RecapMasthead({ recap }: { recap: RecapView }) {
  const { event, totals } = recap;
  return (
    <header className="px-6 pt-2">
      <p className="font-numeric text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
        Mileage Run
      </p>
      <H1 className="mt-2 break-keep">
        {event.evt_nm}
        <br />
        돌아보기
      </H1>
      <p className="mt-2 break-keep text-[14px] text-muted-foreground">
        {mdKo(event.from)}부터 {mdKo(event.end_dt)}까지, {totals.runners}명이 함께 뛰었어요
      </p>
      <div className="rule-masthead mt-4" />
    </header>
  );
}

export function RecapHero({ recap }: { recap: RecapView }) {
  const { journey, totals, sports } = recap;
  const ratio = journey.antipodeKm > 0 ? journey.km / journey.antipodeKm : 0;
  // 내림 — 반올림하면 도착 못 했는데 100%가 찍히는 날이 온다
  const pct = Math.floor(ratio * 1000) / 10;
  const left = journey.antipodeKm - journey.km;

  return (
    <section className="recap-autoplay flex flex-col items-center px-6 pb-4 pt-10 text-center">
      <p className="text-[14px] font-medium text-muted-foreground">
        이번 시즌, 우리가 움직인 거리
      </p>
      <p className="mt-4 flex items-baseline font-numeric text-[68px] font-medium leading-none tracking-tight text-foreground">
        <RecapOdometer value={Math.round(journey.km)} autoplay />
        <span className="ml-1.5 text-[24px] text-muted-foreground">km</span>
      </p>

      {/* 이 숫자가 마일리지가 아니라는 걸 바로 아래에서 말한다 — 마일리지런이라 다들 마일리지로 읽는다 */}
      <p className="mt-4 break-keep text-[14px] leading-relaxed text-muted-foreground">
        뛰고, 산 타고, 자전거 타고, 수영한 거리를 그대로 더했어요.
        <br />
        마일리지 보정·배율 없는 <span className="font-semibold text-foreground">진짜 거리</span>예요.
      </p>
      {sports.length > 0 && (
        <p className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 font-numeric text-[12px] text-muted-foreground tabular-nums">
          {sports.map((s) => (
            <span key={s.sport}>
              {s.emoji} {formatRecapKm(s.km)}
            </span>
          ))}
        </p>
      )}

      {/* 여정 막대 — 서울에서 지구 반대편(둘레의 절반)까지. 아래 도시 도장이 이 막대 위의 정거장들이다 */}
      <div className="mt-10 w-full text-left">
        <div className="flex items-baseline justify-between text-[12px] font-medium text-foreground">
          <span>서울</span>
          <span className="font-numeric text-[15px] text-primary tabular-nums">{pct}%</span>
          <span>지구 반대편</span>
        </div>
        <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className="recap-grow-x absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${Math.min(ratio, 1) * 100}%` }}
          />
        </div>
        <p className="mt-3 break-keep text-center text-[14px] leading-relaxed text-muted-foreground">
          {left > 0 ? (
            <>
              서울에서 지구 반대편까지{" "}
              <span className="font-semibold text-foreground">{formatRecapKm(left)}</span> 남았어요.
              <br />
              다음 시즌에 마저 가요!
            </>
          ) : (
            <>
              지구 반대편 도착! 거기서{" "}
              <span className="font-semibold text-foreground">{formatRecapKm(-left)}</span> 더
              갔어요.
            </>
          )}
        </p>
        <p className="mt-1 text-center text-[13px] text-muted-foreground">
          기록 <span className="font-semibold text-foreground">{formatRecapNumber(totals.acts)}개</span>가
          모여서 만든 거리예요
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  나의 시즌                                                            */
/* ------------------------------------------------------------------ */

export function RecapMySeason({
  mine,
  awards,
  myMemory,
}: {
  mine: RecapMember;
  awards: RecapView["awards"];
  /** 내가 남긴 사진·한마디 중 한 장(랜덤) */
  myMemory: RecapMemory | null;
}) {
  const name = mine.person.mem_nm;

  if (mine.acts === 0) {
    return (
      <Zone label="My Season" lead={`${name} 님의 시즌`}>
        <CardItem variant="dashed" className="break-keep text-center text-[14px] leading-relaxed text-muted-foreground">
          이번 시즌은 쉬어 갔네요.
          <br />
          다음 시즌엔 같이 뛰어요 {RECAP_EMOJI.runner}
        </CardItem>
      </Zone>
    );
  }

  const won = awards.filter((a) => mine.awardKeys.includes(a.key));
  const achieved = mine.months.filter((m) => m.achieved).length;
  const share = mine.crewShare * 100;

  return (
    <Zone label="My Season" lead={`${name} 님의 시즌`}>
      <div className="flex flex-col gap-3">
        <CardItem className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <p className="flex items-baseline font-numeric text-[44px] font-medium leading-none text-foreground">
              <RecapOdometer value={Math.round(mine.km)} />
              <span className="ml-1 text-[18px] text-muted-foreground">km</span>
            </p>
            <p className="pb-1 text-right text-[12px] leading-snug text-muted-foreground">
              크루 전체 거리의
              <br />
              <span className="font-numeric text-[15px] font-medium text-foreground tabular-nums">
                {formatRecapNumber(share, share < 10 ? 1 : 0)}%
              </span>
            </p>
          </div>

          {mine.farthest && (
            <p className="break-keep text-[14px] leading-relaxed text-foreground">
              혼자서도 서울에서 <span className="font-semibold">{mine.farthest.city}</span>
              {" "}({formatRecapKm(mine.farthest.km)})보다 멀리 갔어요
            </p>
          )}

          {/* 달마다 목표 — 동그라미 하나가 한 달. 해낸 달만 채운다.
              **한 달도 못 해냈으면 줄째 안 그린다** — 빈 동그라미만 늘어선 줄은 회고가
              아니라 성적표다(내 화면에만 보여도 그렇다). */}
          {achieved > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] text-muted-foreground">
                {mine.months.length}달 중 {achieved}달 목표 달성
              </span>
              <div className="flex flex-wrap gap-2.5">
                {mine.months.map((m) => (
                  <span key={m.base_dt} className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        "size-7 rounded-full",
                        m.achieved ? "bg-primary" : "border-[1.5px] border-border",
                      )}
                      aria-label={`${dayjs(m.base_dt).format("M월")}${m.achieved ? " 목표 달성" : ""}`}
                    />
                    <span className="font-numeric text-[11px] text-muted-foreground">
                      {dayjs(m.base_dt).format("M월")}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {mine.bestDay && (
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <span className="text-[12px] text-muted-foreground">한 번에 제일 멀리 간 날</span>
              <span className="break-keep text-[14px] text-foreground">
                {mdKo(mine.bestDay.act_dt)} · {mine.bestDay.sport ? `${SPORT_EMOJI[mine.bestDay.sport]} ` : ""}
                <span className="font-numeric font-medium tabular-nums">
                  {formatRecapKm(mine.bestDay.km)}
                </span>
                {mine.bestDay.elv > 0 && ` (오르막 ${formatRecapNumber(mine.bestDay.elv)}m)`}
              </span>
            </div>
          )}

          {won.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {won.map((a) => (
                <span
                  key={a.key}
                  className="rounded-full bg-primary/10 px-2.5 py-1 text-[12px] font-semibold text-primary"
                >
                  {a.emoji} {a.title}
                </span>
              ))}
            </div>
          )}
        </CardItem>

        <div className="grid grid-cols-2 gap-3">
          <StatCard value={`${formatRecapNumber(mine.acts)}개`} label="남긴 기록" />
          <StatCard value={`${mine.days}일`} label="운동한 날" />
          <StatCard value={`${mine.longestStreak}일`} label="최장 연속" />
          <StatCard value={`${formatRecapNumber(mine.elv)}m`} label="오른 높이" />
        </div>

        {myMemory && (
          <div className="mt-2 flex flex-col gap-2">
            <span className="text-[12px] text-muted-foreground">내가 남긴 한 장</span>
            <RecapMemoryCard memory={myMemory} />
          </div>
        )}
      </div>
    </Zone>
  );
}

/* ------------------------------------------------------------------ */
/*  추억 넘기기                                                          */
/* ------------------------------------------------------------------ */

export function RecapMemoriesZone({
  recap,
  initialIndex,
  upcoming,
}: {
  recap: RecapView;
  initialIndex: number;
  upcoming: number[];
}) {
  if (recap.memories.length === 0) return null;
  return (
    <Zone
      label="Memories"
      lead={
        <>
          사진 {formatRecapNumber(recap.totals.photos)}장, 한마디{" "}
          {formatRecapNumber(recap.totals.reviews)}개.
          <br />
          사진부터 한 장씩 넘어가요
        </>
      }
    >
      <RecapMemories memories={recap.memories} initialIndex={initialIndex} upcoming={upcoming} />
    </Zone>
  );
}

/* ------------------------------------------------------------------ */
/*  도시 도장                                                            */
/* ------------------------------------------------------------------ */

/** 도장 잉크 — 여권 도장처럼 몇 가지 색이 섞여 찍힌다 */
const INKS = [
  "border-primary text-primary",
  "border-destructive text-destructive",
  "border-success text-success",
];
/** 도장마다 기울기 — 줄 맞춰 찍힌 도장은 도장처럼 안 보인다 */
const TILTS = [-8, 5, -3, 7, -6, 4, -9, 6, -4, 8, -5, 3];

/**
 * 못 간 도시에 붙이는 다짐 딱지 — 바로 다음 목적지는 "아깝다", 마지막(지구 반대편)은 시즌 목표,
 * 그 사이는 "다음엔 꼭". 아쉬움으로 끝내지 않고 다음 시즌으로 이어 주는 자리다.
 */
function vowFor(kind: "next" | "last" | "mid"): string {
  if (kind === "next") return "아깝다!";
  if (kind === "last") return "다음 시즌 목표!";
  return "다음엔 꼭!";
}

export function RecapCities({ recap }: { recap: RecapView }) {
  const { stops, km } = recap.journey;
  const reached = stops.filter((s) => s.reachedOn).length;
  const next = stops.find((s) => !s.reachedOn);

  return (
    <Zone label="Cities" lead="우리가 같이 움직인 거리로 서울에서 출발하면">
      <ol className="grid grid-cols-3 gap-x-3 gap-y-6">
        {stops.map((s, i) => {
          const done = s.reachedOn !== null;
          const style = {
            "--rot": `${TILTS[i % TILTS.length]}deg`,
            "--i": i,
          } as CSSProperties;
          const kind = s === next ? "next" : i === stops.length - 1 ? "last" : "mid";
          return (
            <li key={s.key} className="relative flex justify-center">
              <div
                style={style}
                className={cn(
                  "flex aspect-square w-full max-w-[100px] flex-col items-center justify-center gap-0.5 rounded-full p-1.5 text-center",
                  done
                    ? cn("stamp-press border-[3px] border-double", INKS[i % INKS.length])
                    : "stamp-miss border-2 border-dashed border-muted-foreground/40 text-muted-foreground",
                )}
              >
                <span className="font-numeric text-[10px] tracking-wide tabular-nums">
                  {formatRecapNumber(s.km)}km
                </span>
                <span className="break-keep text-[13px] font-bold leading-tight">{s.city}</span>
                <span className="font-numeric text-[11px] tabular-nums">
                  {done
                    ? `${dayjs(s.reachedOn).format("M.D")} 도착`
                    : `${formatRecapNumber(s.km - km)}km 남음`}
                </span>
              </div>
              {/* 못 간 도시엔 다짐 딱지 — 도장이 흔들리고 난 뒤 통 튀어 붙는다 */}
              {!done && (
                <span
                  style={{ "--i": i } as CSSProperties}
                  className="stamp-vow absolute -bottom-2 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow-sm"
                >
                  {vowFor(kind)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-6 break-keep text-[14px] leading-relaxed text-foreground">
        {stops.length}곳 중 <span className="font-semibold">{reached}곳</span> 도착!
        {next && (
          <>
            {" "}
            {next.city}까지 <span className="font-semibold">{formatRecapKm(next.km - km)}</span>{" "}
            남았어요. 다음 시즌엔 지구 반대편까지 가 봐요!
          </>
        )}
      </p>
      <p className="mt-1 break-keep text-[12px] leading-relaxed text-muted-foreground">
        도시까지 거리는 서울에서 잰 직선거리예요. 날짜는 다 같이 쌓은 거리가 그만큼 된 날이에요.
      </p>
    </Zone>
  );
}

/* ------------------------------------------------------------------ */
/*  다른 걸로 바꿔 보면                                                   */
/* ------------------------------------------------------------------ */

export function RecapNumbers({ recap }: { recap: RecapView }) {
  const { equivalents, sports } = recap;
  const sportKmSum = sports.reduce((n, s) => n + s.km, 0);

  return (
    <Zone label="Numbers" lead="이 거리를 다른 걸로 바꿔 보면">
      <ul className="flex flex-col">
        {equivalents.map((e) => (
          <li key={e.key} className="rule-row flex items-center gap-4 py-3.5 first:pt-0">
            <span aria-hidden className="w-9 shrink-0 text-center text-[28px] leading-none">
              {e.emoji}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="break-keep text-[18px] font-bold text-foreground">
                {e.unit}{" "}
                <span className="font-numeric font-medium text-primary tabular-nums">
                  {formatTimes(e.times, e.suffix)}
                </span>
              </span>
              <span className="break-keep text-[12px] text-muted-foreground">{e.basis}</span>
            </div>
          </li>
        ))}
      </ul>

      {/* 종목 비중 — 거리 기준. 한 줄 막대 + 범례 */}
      {sports.length > 0 && sportKmSum > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          <span className="text-[12px] font-medium text-muted-foreground">종목별로 보면</span>
          <div className="recap-grow-x flex h-3 w-full overflow-hidden rounded-full">
            {sports.map((s) => (
              <span
                key={s.sport}
                className={SPORT_BG[s.sport]}
                style={{ width: `${(s.km / sportKmSum) * 100}%` }}
              />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
            {sports.map((s) => (
              <li key={s.sport} className="flex min-w-0 items-center gap-2">
                <span className={cn("size-2.5 shrink-0 rounded-full", SPORT_BG[s.sport])} />
                <span className="min-w-0 truncate text-[13px] text-foreground">
                  {s.emoji} {s.label}
                </span>
                <span className="ml-auto shrink-0 font-numeric text-[12px] text-muted-foreground tabular-nums">
                  {formatRecapKm(s.km)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Zone>
  );
}

/* ------------------------------------------------------------------ */
/*  달력                                                                */
/* ------------------------------------------------------------------ */

const HEAT = ["bg-muted", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"];

export function RecapCalendar({ recap }: { recap: RecapView }) {
  const { months, totals, event, busiestDay } = recap;
  const everyDay = totals.activeDays >= event.days;

  return (
    <Zone
      label="Every Day"
      lead={
        // "누군가는 뛰었다"가 아니라 "우리 기강은 뛰었다" — 한 사람의 기록이 아니라 크루가 함께
        // 이어 간 날들이라는 걸 말하는 자리다(협동심이 느껴지게 — 실사용 피드백).
        everyDay ? (
          <>
            {event.days}일 동안 하루도 안 빠지고,
            <br />
            <span className="font-semibold text-foreground">우리 기강은 뛰었어요</span>
          </>
        ) : (
          <>
            {event.days}일 중{" "}
            <span className="font-semibold text-foreground">{totals.activeDays}일</span>, 우리
            기강은 함께 뛰었어요
          </>
        )
      }
    >
      <div className="flex flex-col gap-2">
        {months.map((m) => (
          <div key={m.base_dt} className="flex items-center gap-2">
            <span className="w-7 shrink-0 text-[12px] font-medium text-foreground">
              {m.label}
            </span>
            <div className="grid min-w-0 flex-1 grid-cols-[repeat(31,minmax(0,1fr))] gap-[2px]">
              {m.days.map((d) => (
                <span
                  key={d.date}
                  title={`${mdKo(d.date)} · 기록 ${d.acts}개`}
                  className={cn(
                    "aspect-square rounded-[2px]",
                    HEAT[d.level],
                    busiestDay?.date === d.date &&
                      "ring-[1.5px] ring-foreground ring-offset-1 ring-offset-background",
                  )}
                />
              ))}
            </div>
            <span className="w-10 shrink-0 text-right font-numeric text-[11px] text-muted-foreground tabular-nums">
              {formatRecapNumber(m.km)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span className="break-keep">
          오른쪽은 그 달 거리(km)
        </span>
        <span className="flex shrink-0 items-center gap-1">
          적음
          {HEAT.map((c) => (
            <span key={c} className={cn("size-2 rounded-[2px]", c)} />
          ))}
          많음
        </span>
      </div>

      {busiestDay && (
        <CardItem className="mt-5 flex items-center gap-3">
          <span aria-hidden className="text-[26px] leading-none">
            {RECAP_EMOJI.fire}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[12px] text-muted-foreground">제일 뜨거웠던 날</span>
            <span className="break-keep text-[15px] font-semibold text-foreground">
              {dayjs(busiestDay.date).format("M월 D일 (dd)")}
            </span>
            <span className="break-keep text-[12px] text-muted-foreground">
              {busiestDay.people}명이 함께 {formatRecapKm(busiestDay.km)}를 뛰었어요 · 기록{" "}
              {busiestDay.acts}개
            </span>
          </div>
        </CardItem>
      )}
    </Zone>
  );
}

/* ------------------------------------------------------------------ */
/*  언제 뛰었나 — 요일·시간                                               */
/* ------------------------------------------------------------------ */

export function RecapRhythm({ recap }: { recap: RecapView }) {
  const { weekdays, milestones } = recap;
  const maxWd = Math.max(1, ...weekdays.map((w) => w.km));
  const topWd = weekdays.reduce((a, b) => (b.km > a.km ? b : a), weekdays[0]);
  // 주말 = 토·일(월요일 시작 배열의 마지막 두 칸). 주말은 이틀뿐이라 몫이 30%만 넘어도 "몰아 뛴" 셈이다
  const totalKm = weekdays.reduce((n, w) => n + w.km, 0);
  const weekendKm = weekdays.slice(5).reduce((n, w) => n + w.km, 0);
  const weekendPct = totalKm > 0 ? Math.round((weekendKm / totalKm) * 100) : 0;

  return (
    <Zone label="When" lead="우리는 언제 뛰었을까">
      {/* 요일 — 거리 기준 */}
      <div className="flex flex-col gap-3">
        <span className="break-keep text-[14px] text-foreground">
          <span className="font-semibold">{topWd.label}요일</span>에 제일 많이 뛰었어요 ·{" "}
          <span className="font-numeric tabular-nums">{formatRecapKm(topWd.km)}</span>
        </span>
        <div className="flex h-28 items-end gap-2">
          {weekdays.map((w, i) => (
            <div key={w.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span
                className={cn(
                  "recap-grow-y w-full rounded-t-md",
                  w === topWd ? "bg-primary" : "bg-muted-foreground/25",
                )}
                style={{ height: `${Math.max(4, (w.km / maxWd) * 100)}%`, "--i": i } as CSSProperties}
              />
              <span
                className={cn(
                  "text-[12px]",
                  w === topWd ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {w.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 주말 vs 평일 — 한 줄 막대. 주말 이틀이 전체 거리에서 차지한 몫 */}
      {totalKm > 0 && (
        <div className="mt-8 flex flex-col gap-2.5">
          <span className="break-keep text-[14px] text-foreground">
            주말 이틀에 전체 거리의{" "}
            <span className="font-numeric font-semibold text-primary tabular-nums">{weekendPct}%</span>
            를 뛰었어요
          </span>
          <div className="recap-grow-x flex h-3 w-full overflow-hidden rounded-full">
            <span className="bg-muted-foreground/25" style={{ width: `${100 - weekendPct}%` }} />
            <span className="bg-primary" style={{ width: `${weekendPct}%` }} />
          </div>
          <div className="flex justify-between font-numeric text-[11px] text-muted-foreground tabular-nums">
            <span>평일 5일 · {formatRecapKm(totalKm - weekendKm)}</span>
            <span>주말 2일 · {formatRecapKm(weekendKm)}</span>
          </div>
        </div>
      )}

      {/* 기념비 순간 — 크루 누적이 고비를 넘긴 바로 그 기록. 숫자가 사람 이름으로 남는다 */}
      {milestones.length > 0 && (
        <div className="mt-8 flex flex-col gap-3">
          <span className="text-[14px] font-semibold text-foreground">기념비 순간</span>
          <ol className="relative flex flex-col gap-4 border-l-2 border-border pl-5">
            {milestones.map((m) => (
              <li key={m.key} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-background",
                    m.kind === "km" ? "bg-primary" : "bg-foreground",
                  )}
                />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold text-foreground">{m.label}</span>
                  <span className="shrink-0 font-numeric text-[12px] text-muted-foreground tabular-nums">
                    {mdKo(m.date)}
                  </span>
                </div>
                {m.person ? (
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                    <Avatar
                      src={m.person.avatar_url}
                      seed={m.person.mem_id}
                      alt={m.person.mem_nm}
                      size="xs"
                    />
                    <span className="truncate">
                      <span className="font-semibold text-foreground">{m.person.mem_nm}</span>의{" "}
                      {m.sport ? `${SPORT_EMOJI[m.sport]} ` : ""}
                      {formatRecapKm(m.km)}
                      {m.kind === "km" ? "가 넘겼어요" : "였어요"}
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Zone>
  );
}

/* ------------------------------------------------------------------ */
/*  배율 이벤트                                                          */
/* ------------------------------------------------------------------ */

export function RecapBonus({ recap }: { recap: RecapView }) {
  const list = recap.multipliers.slice(0, 8);
  if (list.length === 0) return null;
  return (
    <Zone label="Bonus" lead="배율 이벤트, 얼마나 탔을까">
      <ul className="flex flex-col">
        {list.map((m) => (
          <li key={m.name} className="rule-row flex items-start gap-3 py-3 first:pt-0">
            <span className="mt-0.5 w-12 shrink-0 rounded-md bg-primary/10 py-1 text-center font-numeric text-[13px] font-medium text-primary tabular-nums">
              ×{formatRecapNumber(m.val, 2)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 break-keep text-[14px] leading-snug text-foreground">
                  {m.name}
                </span>
                <span className="shrink-0 font-numeric text-[12px] text-muted-foreground tabular-nums">
                  {formatRecapNumber(m.uses)}번 · {m.people}명
                </span>
              </div>
              {m.top.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                  <span>제일 많이 탄 사람</span>
                  {m.top.map((t) => (
                    <span key={t.person.mem_id} className="flex items-center gap-1 text-foreground">
                      <Avatar
                        src={t.person.avatar_url}
                        seed={t.person.mem_id}
                        alt={t.person.mem_nm}
                        size="xs"
                      />
                      <span className="font-semibold">{t.person.mem_nm}</span>
                    </span>
                  ))}
                  <span className="font-numeric tabular-nums">{m.top[0].uses}번</span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Zone>
  );
}

/* ------------------------------------------------------------------ */
/*  시상식                                                              */
/* ------------------------------------------------------------------ */

export function RecapAwards({
  recap,
  winnerMemories,
}: {
  recap: RecapView;
  /** `${award.key}:${mem_id}` → 그 수상자가 남긴 한 장(랜덤) */
  winnerMemories: Record<string, RecapMemory | null>;
}) {
  if (recap.awards.length === 0) return null;
  return (
    <Zone label="Awards" lead="시즌 시상식! 부문마다 1등만 불러요">
      <ul className="flex flex-col gap-3">
        {recap.awards.map((a) => {
          const memories = a.winners.length <= RECAP_MEMORY_WINNER_MAX
            ? a.winners
                .map((w) => winnerMemories[`${a.key}:${w.person.mem_id}`])
                .filter((m): m is RecapMemory => m != null)
            : [];
          return (
            <li key={a.key}>
              <CardItem className="flex flex-col gap-3">
                <div className="flex items-start gap-3.5">
                  <span aria-hidden className="w-9 shrink-0 pt-0.5 text-center text-[30px] leading-none">
                    {a.emoji}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="shrink-0 text-[16px] font-bold text-foreground">{a.title}</span>
                      <span className="min-w-0 truncate text-right font-numeric text-[17px] font-medium text-primary tabular-nums">
                        {a.value}
                      </span>
                    </div>
                    <p className="break-keep text-[13px] leading-relaxed text-muted-foreground">
                      {a.caption}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2.5">
                      {a.winners.map((w) => (
                        <li key={w.person.mem_id} className="flex min-w-0 items-center gap-1.5">
                          <Avatar
                            src={w.person.avatar_url}
                            seed={w.person.mem_id}
                            alt={w.person.mem_nm}
                            size="sm"
                          />
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-[13px] font-semibold text-foreground">
                              {w.person.mem_nm}
                            </span>
                            {w.sub && (
                              <span className="truncate font-numeric text-[11px] text-muted-foreground tabular-nums">
                                {w.sub}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 수상자가 남긴 한 장 — 숫자만 있으면 상이 남의 일 같다. 그 사람 사진·말이
                    붙어야 "아 그날 그거" 하고 떠오른다. 들어올 때마다 다른 장이 뜬다. */}
                {memories.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {memories.map((m) => (
                      <RecapMemorySnippet key={m.person.mem_id} memory={m} />
                    ))}
                  </div>
                )}
              </CardItem>
            </li>
          );
        })}
      </ul>
    </Zone>
  );
}

/* ------------------------------------------------------------------ */
/*  마지막 날                                                            */
/* ------------------------------------------------------------------ */

export function RecapLastDay({ recap }: { recap: RecapView }) {
  const last = recap.lastDay;
  if (!last) return null;
  const quotes = last.memories.filter((m) => m.text);
  const photos = last.memories.filter((m) => m.photo_url);

  return (
    <Zone
      label="Last Day"
      lead={
        <>
          {dayjs(last.date).format("M월 D일")}, 마지막 날까지
          <br />
          <span className="font-semibold text-foreground">우리 기강은 멈추지 않았어요</span> ·{" "}
          {last.people}명
        </>
      }
    >
      {quotes.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {quotes.map((m, i) => (
            <li key={`${m.person.mem_id}-${i}`} className="flex items-start gap-2.5">
              <Avatar src={m.person.avatar_url} seed={m.person.mem_id} alt={m.person.mem_nm} size="sm" />
              <div className="flex min-w-0 flex-col gap-0.5 rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5">
                <span className="text-[11px] font-semibold text-muted-foreground">{m.person.mem_nm}</span>
                <span className="break-keep text-[15px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
                  {m.text}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {photos.length > 0 && (
        <div className={cn("grid grid-cols-3 gap-2", quotes.length > 0 && "mt-4")}>
          {photos.slice(0, 6).map((m, i) => (
            <RecapMemoryCard
              key={`${m.person.mem_id}-p${i}`}
              memory={{ ...m, text: null }}
              size="sm"
              showMeta={false}
            />
          ))}
        </div>
      )}
    </Zone>
  );
}

/* ------------------------------------------------------------------ */
/*  함께 뛴 사람들 + 마무리                                               */
/* ------------------------------------------------------------------ */

/** 크루 그리드 열 수 — 얼굴이 날아오는 출발점(그리드 가운데) 계산과 같은 값을 써야 한다 */
const CREW_COLS = 4;

/**
 * 함께 뛴 사람들 — 화면에 들어오면 이름순으로 한 명씩 그리드 가운데에서 튀어나와 제자리에
 * 박힌다(globals.css `.crew-drop`). 출발점은 "이 칸에서 그리드 가운데까지"를 칸 폭·간격 단위로
 * 넘긴다 — 퍼센트는 자기 크기 기준이라 `(100% + 간격) × 칸 수`가 곧 실제 거리다.
 * 위로 40px 더 띄워 "위에서 떨어지는" 느낌을 얹는다.
 */
export function RecapCredits({ recap }: { recap: RecapView }) {
  const { credits } = recap;
  const rows = Math.ceil(credits.length / CREW_COLS);
  const midCol = (CREW_COLS - 1) / 2;
  const midRow = (rows - 1) / 2;
  return (
    <Zone label="Crew" lead={`이번 시즌을 함께 뛴 ${credits.length}명`}>
      {/* 얼굴은 존이 아니라 **그리드가 화면 중간(위에서 45%)까지 올라왔을 때** 박히기 시작한다 —
          존 머리에서 켜면 앞사람들이 아직 화면 아래에서 박혀 버린다(실사용 피드백).
          gap-x-2(0.5rem)·gap-y-4(1rem)는 아래 출발점 계산과 같이 움직인다 */}
      <RecapReveal className="crew-grid" rootMargin="0px 0px -55% 0px">
      <ul className="grid grid-cols-4 gap-x-2 gap-y-4">
        {credits.map((p, i) => (
          <li
            key={p.mem_id}
            className="crew-drop flex min-w-0 flex-col items-center gap-1.5"
            style={
              {
                "--i": i,
                "--fx": `calc(${midCol - (i % CREW_COLS)} * (100% + 0.5rem))`,
                "--fy": `calc(${midRow - Math.floor(i / CREW_COLS)} * (100% + 1rem) - 40px)`,
              } as CSSProperties
            }
          >
            <Avatar src={p.avatar_url} seed={p.mem_id} alt={p.mem_nm} size="md" />
            <span className="w-full truncate text-center text-[12px] text-foreground">
              {p.mem_nm}
            </span>
          </li>
        ))}
      </ul>
      </RecapReveal>
    </Zone>
  );
}

/** "10월 11일 (일) 오후 5시" — 정각이면 분을 안 붙인다 */
function partyWhen(sttAt: string): string {
  const minute = Number(formatKST(sttAt, "m"));
  return formatKST(sttAt, minute === 0 ? "M월 D일 (dd) A h시" : "M월 D일 (dd) A h시 m분");
}

/**
 * 마무리 — 페이지 맨 끝. 인사 → 단체사진(있으면) → 회식 초대(있으면, 맨 마지막).
 *
 * 크루 존과 떼어 둔 건 크루가 앞쪽(추억 다음)으로 올라가서다 — 인사가 크루에 붙어 있으면
 * 시상식·숫자들보다 먼저 "고생 많았어요"가 나와 버린다.
 * 회식 초대는 **그 모임으로 바로 가는 딥링크**다(`/schedule?gthr=` — 앱 공통 모임 딥링크).
 * 회식 시간이 지나면 페이지가 `party`를 안 넘겨 저절로 내려간다.
 */
/** 단체사진 기울기 — 책상에 흩어 놓은 폴라로이드처럼 */
const GROUP_TILTS = [-5, 3, -2];

export function RecapFinale({
  recap,
  party,
  groupPhotoUrls,
}: {
  recap: RecapView;
  party: RecapParty | null;
  groupPhotoUrls: string[];
}) {
  return (
    <RecapReveal className="flex flex-col items-center gap-3 px-6 text-center">
      <span aria-hidden className="text-[44px] leading-none">
        {RECAP_EMOJI.finish}
      </span>
      <p className="break-keep text-[22px] font-bold leading-snug text-foreground">
        다들 진짜 고생 많았어요!
      </p>
      <p className="break-keep text-[15px] leading-relaxed text-muted-foreground">
        {recap.event.evt_nm}, 덕분에 즐거웠어요.
        <br />
        다음 시즌에 또 같이 뛰어요 {RECAP_EMOJI.runner}
      </p>

      {/* 단체사진 — 작게 세 장을 나란히, 살짝씩 기울여 흩어 놓는다. 한 장을 크게 걸면
          "공식 사진"이 되지만 여러 장이 흩어져 있으면 "우리 앨범"이 된다. */}
      {groupPhotoUrls.length > 0 && (
        <div className="mt-8 grid w-full grid-cols-3 gap-2 px-1">
          {groupPhotoUrls.slice(0, 3).map((url, i) => (
            <div
              key={url}
              className="rounded-md bg-card p-1 pb-3 shadow-md ring-1 ring-border"
              style={{ transform: `rotate(${GROUP_TILTS[i % GROUP_TILTS.length]}deg)` }}
            >
              <div className="relative aspect-square overflow-hidden rounded-sm bg-muted">
                <Image
                  src={url}
                  alt="기강 단체사진"
                  fill
                  sizes="33vw"
                  className="object-cover"
                  referrerPolicy="no-referrer"
                  unoptimized
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {party && (
        <CardItem className="mt-8 flex w-full flex-col items-center gap-2 bg-primary/5 px-5 py-6">
          <span aria-hidden className="text-[36px] leading-none">
            {RECAP_EMOJI.cheers}
          </span>
          <p className="mt-1 break-keep text-[18px] font-bold text-foreground">
            아직 끝이 아니에요!
          </p>
          <p className="break-keep text-[15px] leading-relaxed text-foreground">
            {party.gthr_nm}에서 다 같이 만나요
          </p>
          <p className="break-keep text-[13px] leading-relaxed text-muted-foreground">
            {partyWhen(party.stt_at)}
            {party.loc_txt && (
              <>
                <br />
                {party.loc_txt}
              </>
            )}
          </p>
          <Button asChild className="mt-3 h-12 w-full rounded-full text-[15px] font-semibold">
            <Link href={`/schedule?gthr=${party.gthr_id}`}>회식 참석하러 가기</Link>
          </Button>
        </CardItem>
      )}
    </RecapReveal>
  );
}
