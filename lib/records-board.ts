/**
 * 기강의 전당(랭킹탭) 표시 규칙 — 챔피언 띠·내 기록 판독선·철인 명단이 공유하는 판정 한 곳.
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
 * 철인3종 종목.
 *
 * `chip` — 행에 다는 짧은 라벨. `label`(관리 표기)과 갈라 두는 이유는 칩이 행 안에서 폭을 먹기 때문이다.
 * `showWhenEmpty` — 완주자가 0명이어도 점선 칸으로 자리를 지킬 종목. **킹만** 켠다:
 *   전당의 빈 칸은 "첫 완주가 첫 줄이 된다"고 말하는 자리인데, 올림픽을 통영/기타로 가른
 *   파생 칸까지 빈 채로 세우면 안내가 아니라 미완성 표로 읽힌다.
 */
export const TRIATHLON_EVENTS = [
  { eventType: "TRIATHLON_FULL", label: "킹", chip: "킹", filter: null, showWhenEmpty: true },
  { eventType: "TRIATHLON_HALF", label: "하프", chip: "하프", filter: null, showWhenEmpty: false },
  {
    eventType: "TRIATHLON_OLYMPIC_TY",
    label: "올림픽 - 통영",
    chip: "올림픽 · 통영",
    filter: (name: string | null) => name?.includes("통영") ?? false,
    showWhenEmpty: false,
  },
  {
    eventType: "TRIATHLON_OLYMPIC_ETC",
    label: "올림픽 - 기타",
    chip: "올림픽",
    filter: (name: string | null) => !(name?.includes("통영") ?? false),
    showWhenEmpty: false,
  },
] as const;

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
    gap: gap > 0 ? String(gap) : null,
  };
}

/* ------------------------------------------------------------------ */
/*  철인3종 — 순위가 아니라 명단                                        */
/* ------------------------------------------------------------------ */

export type TriathlonRow<T> = { chip: string; entry: T };

/**
 * 종목별로 갈라 담긴 철인3종을 한 명단으로 편다.
 *
 * **순위 배지를 달지 않는다**: 종목이 다르면 애초에 한 줄로 순위를 매길 수 없다
 * (킹 1위와 올림픽 1위가 나란히 1위다). 종목을 칩으로 내리고 거리 내림차순 → 기록순으로만 세운다.
 * 사람이 늘어 종목 하나가 목록다워지면 그때 그 안에서 순위를 붙이면 된다.
 */
export function flattenTriathlon<T>(
  events: readonly { eventType: string; entries: readonly T[] }[],
): TriathlonRow<T>[] {
  const chipOf = new Map(TRIATHLON_EVENTS.map((e) => [e.eventType as string, e.chip as string]));
  return events.flatMap((evt) =>
    evt.entries.map((entry) => ({ chip: chipOf.get(evt.eventType) ?? evt.eventType, entry })),
  );
}

/**
 * 완주자가 없어 점선 칸으로 남길 종목들.
 * `showWhenEmpty`가 켜진 종목만, 그마저 비었을 때만 돌려준다.
 */
export function getEmptyTriathlonSlots(
  events: readonly { eventType: string; entries: readonly unknown[] }[],
): { eventType: string; chip: string }[] {
  const countOf = new Map(events.map((e) => [e.eventType, e.entries.length]));
  return TRIATHLON_EVENTS.filter((e) => e.showWhenEmpty && (countOf.get(e.eventType) ?? 0) === 0).map(
    (e) => ({ eventType: e.eventType, chip: e.chip }),
  );
}
