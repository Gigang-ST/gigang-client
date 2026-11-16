/**
 * 기강의 전당(랭킹탭) 표시 규칙 — 챔피언 띠·내 기록 판독선·철인 코스 판이 공유하는 판정 한 곳.
 *
 * 화면 컴포넌트가 각자 "1위를 어떻게 떼나 / 격차를 어떻게 쓰나"를 들고 있으면 세 카테고리가
 * 조금씩 어긋난다. 순수 함수로 모아 두고 회귀 테스트(`lib/__tests__/records-board.test.ts`)가 못박는다.
 */

import { secondsToTime } from "@/lib/dayjs";

/* ------------------------------------------------------------------ */
/*  종목 정의                                                          */
/* ------------------------------------------------------------------ */

/** 마라톤 종목 서브탭 — 거리 내림차순 */
export const MARATHON_EVENTS = [
  { eventType: "FULL", label: "풀마라톤" },
  { eventType: "HALF", label: "하프마라톤" },
  { eventType: "10K", label: "10K" },
] as const;

/**
 * 철인3종 코스 — 전당 철인 판의 하위 탭(pill) 순서이기도 하다(거리 내림차순).
 *
 * `label` — pill 이름. 짧게 둔다(375px 한 줄에 다섯 개가 서야 한다).
 * `legs` — 그 코스의 **규정 거리**(수영·자전거·달리기). 탭 아래 한 줄로 깔아 "무슨 코스인지"를 말한다.
 *   사람 기록이 아니라 코스 규격이라 데이터가 없어도 지어낸 값이 아니다. 통영 올림픽도 표준 올림픽 거리다.
 * `showWhenEmpty` — 완주자가 0명이어도 탭으로 자리를 지킬 코스. **킹만** 켠다:
 *   빈 탭은 "첫 완주가 첫 줄이 된다"고 말하는 자리인데, 올림픽을 통영/기타로 가른 파생 칸이나
 *   스프린트까지 빈 채로 세우면 안내가 아니라 미완성 표로 읽힌다(기록 없는 코스는 숨긴다, #683).
 * `filter` — RPC 코드 하나(`TRIATHLON_OLYMPIC`)를 대회 이름으로 다시 가르는 파생 칸만 갖는다.
 */
export const TRIATHLON_EVENTS = [
  {
    eventType: "TRIATHLON_FULL",
    label: "킹",
    legs: { swim: "3.8", bike: "180.2", run: "42.2" },
    filter: null,
    showWhenEmpty: true,
  },
  {
    eventType: "TRIATHLON_HALF",
    label: "하프",
    legs: { swim: "1.9", bike: "90", run: "21.1" },
    filter: null,
    showWhenEmpty: false,
  },
  {
    eventType: "TRIATHLON_OLYMPIC_TY",
    label: "올림픽 · 통영",
    legs: { swim: "1.5", bike: "40", run: "10" },
    filter: (name: string | null) => name?.includes("통영") ?? false,
    showWhenEmpty: false,
  },
  {
    eventType: "TRIATHLON_OLYMPIC_ETC",
    label: "올림픽",
    legs: { swim: "1.5", bike: "40", run: "10" },
    filter: (name: string | null) => !(name?.includes("통영") ?? false),
    showWhenEmpty: false,
  },
  {
    // RPC는 #581부터 SPRINT를 TRIATHLON_SPRINT로 내려 주는데 받을 칸이 없었다.
    // 기록이 생기면 탭이 서고, 없으면 숨는다(showWhenEmpty=false).
    eventType: "TRIATHLON_SPRINT",
    label: "스프린트",
    legs: { swim: "0.75", bike: "20", run: "5" },
    filter: null,
    showWhenEmpty: false,
  },
] as const;

export type TriathlonEventType = (typeof TRIATHLON_EVENTS)[number]["eventType"];

/* ------------------------------------------------------------------ */
/*  챔피언 떼기                                                        */
/* ------------------------------------------------------------------ */

/**
 * 1위(챔피언)와 그 뒤 목록을 가른다.
 *
 * 1위는 board 띠로 올라가고 목록은 2위부터 그린다. 목록이 비면 챔피언도 없다 —
 * 빈 목록에 챔피언 자리만 남기면 "아직 안 켜진 계기"가 아니라 고장으로 읽힌다.
 */
export function splitChampion<T>(entries: readonly T[]): { champion: T | null; rest: T[] } {
  if (entries.length === 0) return { champion: null, rest: [] };
  return { champion: entries[0], rest: entries.slice(1) };
}

/* ------------------------------------------------------------------ */
/*  내 기록 판독선                                                     */
/* ------------------------------------------------------------------ */

export type MyStanding = {
  rank: number;
  /** 표시용 내 기록/지수 */
  value: string;
  /**
   * 1위와의 거리. 내가 1위거나 동률이면 `null`.
   *
   * 순위 숫자만 있으면 이 줄이 "N위 행"으로 읽혀 바로 위 챔피언 띠와 순위축이 엉킨다.
   * 격차가 붙어야 나와 전당 사이를 재는 계기가 된다.
   *
   * **부호는 "1위보다 어떤가"를 말한다** — 시간은 느릴수록 큰 값이라 `+`, 지수는 낮을수록
   * 작은 값이라 `-`. 화면 문구도 `1위까지`가 아니라 `1위보다`다: `1위까지 +1:30`은
   * "1위에 도달하려면 +1:30"으로 읽혀 부호가 거꾸로 걸린다.
   */
  gap: string | null;
};

type TimeRankRow = { rank: number; memId: string; record: string; recordSec: number };

/**
 * 시간 종목(마라톤·철인)의 내 위치. 짧을수록 상위라 격차는 `+`가 붙는다.
 *
 * 비로그인·기록 없음이면 `null` — 호출부가 등록 유도로 갈아끼운다.
 */
export function getMyTimeStanding(
  entries: readonly TimeRankRow[],
  memId: string | null | undefined,
): MyStanding | null {
  if (!memId || entries.length === 0) return null;
  const mine = entries.find((e) => e.memId === memId);
  if (!mine) return null;

  const gapSec = mine.recordSec - entries[0].recordSec;
  return {
    rank: mine.rank,
    value: mine.record,
    gap: gapSec > 0 ? `+${secondsToTime(gapSec)}` : null,
  };
}

type IndexRankRow = { rank: number; memId: string; utmbIndex: number };

/**
 * UTMB INDEX의 내 위치. **클수록 상위**라 시간과 부호 방향이 반대다 —
 * 같은 함수로 처리하면 트레일에서 격차가 음수로 찍힌다.
 */
export function getMyIndexStanding(
  entries: readonly IndexRankRow[],
  memId: string | null | undefined,
): MyStanding | null {
  if (!memId || entries.length === 0) return null;
  const mine = entries.find((e) => e.memId === memId);
  if (!mine) return null;

  const gap = entries[0].utmbIndex - mine.utmbIndex;
  return {
    rank: mine.rank,
    value: String(mine.utmbIndex),
    // 지수는 낮을수록 아래다 — 시간(`+`)과 부호가 반대로 나가야 "1위보다"가 사실이 된다
    gap: gap > 0 ? `-${gap}` : null,
  };
}

/* ------------------------------------------------------------------ */
/*  철인3종 — 코스별 판 (#683)                                          */
/* ------------------------------------------------------------------ */

/**
 * 구간 기록(초). 기록 등록 때 선택 입력이라 구간마다 비어 있을 수 있다.
 * 셋 다 비면 `null`로 둔다 — 빈 SWIM/BIKE/RUN 격자를 세우면 "구간 기록이 0"처럼 읽힌다.
 */
export type TriathlonSplits = { swim: number | null; bike: number | null; run: number | null };

/** DB 행(`rec_race_hist`의 *_time_sec)에서 구간 기록을 뽑는다. 하나도 없으면 `null` */
export function pickTriathlonSplits(row: {
  swim_time_sec: number | null;
  bike_time_sec: number | null;
  run_time_sec: number | null;
}): TriathlonSplits | null {
  const pos = (v: number | null) => (v != null && v > 0 ? v : null);
  const splits = { swim: pos(row.swim_time_sec), bike: pos(row.bike_time_sec), run: pos(row.run_time_sec) };
  return splits.swim == null && splits.bike == null && splits.run == null ? null : splits;
}

/**
 * 랭킹 행과 원본 기록 행을 잇는 키. 랭킹 RPC가 기록 id를 안 내려 줘서
 * (사람 · 완주 시간 · 대회 이름) 셋으로 맞춘다 — 같은 사람이 같은 대회를 같은 초로 두 번 완주할 일은 없다.
 */
export function triathlonSplitKey(memId: string, recordSec: number, raceName: string | null): string {
  return `${memId}|${recordSec}|${raceName ?? ""}`;
}

/**
 * 탭으로 세울 코스 — 기록이 있는 코스 + `showWhenEmpty`(킹). 순서는 `TRIATHLON_EVENTS` 그대로.
 * 기록 없는 파생 칸(올림픽·통영 등)까지 세우면 빈 탭을 눌러 보는 일만 는다.
 */
export function visibleTriathlonEvents<E extends { eventType: string; male: readonly unknown[]; female: readonly unknown[] }>(
  events: readonly E[],
): E[] {
  const show = new Map(TRIATHLON_EVENTS.map((e) => [e.eventType as string, e.showWhenEmpty as boolean]));
  return events.filter((e) => e.male.length + e.female.length > 0 || (show.get(e.eventType) ?? false));
}

/**
 * 처음 열 코스 — 기록이 있는 첫 코스. 킹은 비어도 탭이 서지만, 들어오자마자 빈 판을 보여 줄 이유는 없다.
 */
export function defaultTriathlonEvent(
  events: readonly { eventType: string; male: readonly unknown[]; female: readonly unknown[] }[],
): string {
  return (events.find((e) => e.male.length + e.female.length > 0) ?? events[0])?.eventType ?? "";
}
