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
 * 철인3종 코스 — 전당 철인 판의 하위 탭(pill). **킹 · 하프 · 올림픽 세 개로 고정**한다(크루장 지시, #683).
 * 기록이 없어도 탭은 선다 — 열면 빈 띠 + 등록 안내가 "첫 완주가 첫 줄"이라고 말한다.
 *
 * `legs` — 그 코스의 **규정 거리**(수영·자전거·달리기). 판 맨 아래 COURSE 블록이 깐다.
 *   사람 기록이 아니라 코스 규격이라 데이터가 없어도 지어낸 값이 아니다.
 * `bySeries` — 대회별 칩을 세우는 코스. **올림픽만** 켠다: 올림픽 거리는 대회가 여럿이라
 *   "통영에선 누가 제일 빠른가"가 궁금해지지만, 킹·하프는 한 해 대회가 한두 개라 칩이 의미가 없다.
 *
 * 스프린트(`TRIATHLON_SPRINT`)는 탭이 없다 — 판에 서지 않는다(어디에 둘지는 별건).
 */
export const TRIATHLON_EVENTS = [
  { eventType: "TRIATHLON_FULL", label: "킹", legs: { swim: "3.8", bike: "180.2", run: "42.2" }, bySeries: false },
  { eventType: "TRIATHLON_HALF", label: "하프", legs: { swim: "1.9", bike: "90", run: "21.1" }, bySeries: false },
  { eventType: "TRIATHLON_OLYMPIC", label: "올림픽", legs: { swim: "1.5", bike: "40", run: "10" }, bySeries: true },
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
 * 처음 열 코스 — 기록이 있는 첫 코스. 탭은 셋 다 서지만, 들어오자마자 빈 판을 보여 줄 이유는 없다.
 */
export function defaultTriathlonEvent(
  events: readonly { eventType: string; male: readonly unknown[]; female: readonly unknown[] }[],
): string {
  return (events.find((e) => e.male.length + e.female.length > 0) ?? events[0])?.eventType ?? "";
}

/* ------------------------------------------------------------------ */
/*  철인 올림픽 — 대회별 묶음                                          */
/* ------------------------------------------------------------------ */

/** 행정 단위 접미사 — 「창원특례시」·「통영시」·「고성군」을 「창원」·「통영」·「고성」으로 */
const ADMIN_SUFFIX = /(특례시|특별자치시|특별자치도|특별시|광역시|시|군|구)$/;

/** 대회 이름 앞머리의 연도·회차 — 같은 대회가 해마다 이름이 갈리는 부분 */
const EDITION_TOKEN = /^(\d{4}년?|제?\d+회|\d+(st|nd|rd|th))$/i;

function shortPlace(token: string): string {
  const stripped = token.replace(ADMIN_SUFFIX, "");
  return stripped.length >= 2 ? stripped : token;
}

/**
 * 같은 대회 시리즈를 한 묶음으로 부를 짧은 이름(칩 라벨이자 묶음 키) — 「통영」·「창원」.
 *
 * **대회 시리즈 id가 DB에 없다.** `comp_mst`는 해마다 새 행(2024 통영 ≠ 2025 통영)이고 `ext_id`도 회차별이다.
 * 그래서 사람이 가장 덜 흔드는 값부터 쓴다:
 * 1. `comp_mst.loc_nm`(대회 지역)이 있으면 그 첫 낱말 — 「통영」.
 * 2. 없으면 대회 이름에서 연도·회차(`2024`·`제6회`)를 걷고 남은 첫 낱말 — 「제6회 창원특례시 마산만 …」 → 「창원」.
 * 둘 다 행정 단위 접미사(시·군·특례시…)를 떼어 「통영시」와 「통영」이 갈리지 않게 한다. 못 뽑으면 `null`.
 */
export function triathlonSeriesLabel(comp: { loc_nm?: string | null; comp_nm?: string | null }): string | null {
  const loc = comp.loc_nm?.trim().split(/\s+/)[0];
  if (loc) return shortPlace(loc);
  const tokens = (comp.comp_nm ?? "").trim().split(/\s+/).filter((t) => t && !EDITION_TOKEN.test(t));
  const first = tokens[0];
  if (!first || /^\d+$/.test(first)) return null;
  return shortPlace(first);
}

/** 대회 묶음 칩 — 완주자 많은 순, 같으면 이름순. 「기타」는 늘 맨 끝 */
export function sortTriathlonSeries<S extends { label: string; male: readonly unknown[]; female: readonly unknown[] }>(
  series: readonly S[],
): S[] {
  const n = (s: S) => s.male.length + s.female.length;
  const etc = (s: S) => (s.label === TRIATHLON_SERIES_ETC ? 1 : 0);
  return [...series].sort((a, b) => etc(a) - etc(b) || n(b) - n(a) || a.label.localeCompare(b.label, "ko"));
}

/* ------------------------------------------------------------------ */
/*  철인 구간 — 수영 · 자전거 · 러닝 · 트랜지션                          */
/* ------------------------------------------------------------------ */

/** 구간 기록 + 트랜지션(T1+T2 합). 트랜지션은 저장 칸이 없어 완주 시간에서 세 구간을 뺀다 */
export type TriathlonLegs = TriathlonSplits & { transition: number | null };

export type TriathlonLegKey = keyof TriathlonLegs;

/**
 * 구간 — 순서·이름·색이 한 곳. 화면의 4칸·비율 막대·기준 토글이 전부 이 순서를 쓴다.
 *
 * 색은 종목 토큰(`--sport-*`, DESIGN.md §종목) 안에서 고른다: 수영 = 철인(청록 — 물), 자전거 = 사이클,
 * 러닝 = 로드 러닝. 트랜지션은 종목이 아니라 갈아타는 시간이라 무채색(`muted-foreground`)으로 둔다.
 * 클래스 문자열은 Tailwind가 찾을 수 있게 통째로 적는다(조립하면 스캐너가 못 본다).
 */
export const TRIATHLON_LEGS = [
  { key: "swim", label: "수영", code: "SWIM", bar: "bg-sport-triathlon", dot: "bg-sport-triathlon" },
  { key: "bike", label: "자전거", code: "BIKE", bar: "bg-sport-cycling", dot: "bg-sport-cycling" },
  { key: "run", label: "러닝", code: "RUN", bar: "bg-sport-road-run", dot: "bg-sport-road-run" },
  { key: "transition", label: "트랜지션", code: "T1+T2", bar: "bg-muted-foreground/50", dot: "bg-muted-foreground/50" },
] as const satisfies readonly { key: TriathlonLegKey; label: string; code: string; bar: string; dot: string }[];

/**
 * 트랜지션(T1+T2) — 완주 시간 − 수영 − 자전거 − 러닝. 기록 입력 화면(「트랜지션 자동 계산」)과 같은 정의다.
 * 세 구간 중 하나라도 없으면 `null`(나머지를 다 트랜지션으로 몰면 거짓말이 된다), 음수면 입력 오류라 `null`.
 */
export function triathlonTransition(splits: TriathlonSplits | null, totalSec: number): number | null {
  if (!splits || splits.swim == null || splits.bike == null || splits.run == null) return null;
  const t = totalSec - splits.swim - splits.bike - splits.run;
  return t >= 0 ? t : null;
}

/** 구간 기록에 트랜지션을 더한다. 구간이 하나도 없으면 `null` 그대로 */
export function withTransition(splits: TriathlonSplits | null, totalSec: number): TriathlonLegs | null {
  return splits ? { ...splits, transition: triathlonTransition(splits, totalSec) } : null;
}

/* ------------------------------------------------------------------ */
/*  철인 판 만들기                                                     */
/* ------------------------------------------------------------------ */

/** 랭킹 RPC 한 행(철인) — 한 사람이 여러 줄일 수 있다(대회마다) */
export type TriathlonRankRow = {
  memId: string;
  name: string;
  gender: string;
  evtCd: string;
  recordSec: number;
  raceName: string | null;
};

export type TriathlonBoardEntry = {
  rank: number;
  memId: string;
  name: string;
  /** 큰 숫자 — 「전체」 기준이면 완주 시간, 구간 기준이면 그 구간 시간 */
  record: string;
  recordSec: number;
  raceName: string | null;
  splits: TriathlonLegs | null;
  /** 구간 기준 판에서만 — 같은 기록의 완주 시간(보조 표시) */
  totalRecord?: string;
  /** 구간 기준 판에서만 — 같은 기록의 완주 시간(초). 비율 막대의 분모 */
  totalSec?: number;
};

export type TriathlonBoard = { male: TriathlonBoardEntry[]; female: TriathlonBoardEntry[] };

/** 구간 기준 판 — 그 구간 기록이 없는 사람은 빠지고 `missing`으로만 센다 */
export type TriathlonLegBoard = TriathlonBoard & { missing: number };

/**
 * 한 판(코스 전체 또는 대회 하나) — 「전체」 판 + 구간별 판 + 구간 1위 표.
 * `legLeaders`는 memId → 그 사람이 1위인 구간들(남·녀 각각, 동률이면 모두). 카드의 「수영 1위」 표시가 쓴다.
 */
export type TriathlonViews = TriathlonBoard & {
  legs: Record<TriathlonLegKey, TriathlonLegBoard>;
  legLeaders: Record<string, TriathlonLegKey[]>;
};

export type TriathlonSeriesBoard = TriathlonViews & { label: string };
export type TriathlonEventBoard = TriathlonViews & {
  eventType: string;
  label: string;
  /** 대회별 판 — `bySeries` 코스(올림픽)만 채운다. 묶음이 하나뿐이어도 담고, 칩을 숨길지는 화면이 정한다 */
  series: TriathlonSeriesBoard[];
};

/** 묶음 이름을 못 뽑은 대회 — 칩에서 빠지지 않게 한 곳에 모은다 */
export const TRIATHLON_SERIES_ETC = "기타";

const GENDERS = ["male", "female"] as const;

/**
 * 한 사람당 가장 빠른 한 줄만 남겨 남·녀 순위를 매긴다.
 * `secOf`가 순위 기준(완주 시간 또는 구간 시간) — `null`이면 그 줄은 이 판에 못 선다.
 */
function rankBy(
  rows: readonly TriathlonRankRow[],
  legsOf: (row: TriathlonRankRow) => TriathlonLegs | null,
  leg: TriathlonLegKey | null,
): TriathlonLegBoard {
  const secOf = (r: TriathlonRankRow) => (leg ? (legsOf(r)?.[leg] ?? null) : r.recordSec);
  const best = new Map<string, { row: TriathlonRankRow; sec: number }>();
  const everyone = new Map<string, string>();
  for (const r of rows) {
    everyone.set(r.memId, r.gender);
    const sec = secOf(r);
    if (sec == null) continue;
    const cur = best.get(r.memId);
    if (!cur || sec < cur.sec) best.set(r.memId, { row: r, sec });
  }
  const side = (gender: string) =>
    [...best.values()]
      .filter(({ row }) => row.gender === gender)
      .sort((a, b) => a.sec - b.sec)
      .map(({ row, sec }, i) => ({
        rank: i + 1,
        memId: row.memId,
        name: row.name,
        record: secondsToTime(sec),
        recordSec: sec,
        raceName: row.raceName,
        splits: legsOf(row),
        ...(leg ? { totalRecord: secondsToTime(row.recordSec), totalSec: row.recordSec } : {}),
      }));
  const missing = [...everyone].filter(
    ([memId, gender]) => !best.has(memId) && (GENDERS as readonly string[]).includes(gender),
  ).length;
  return { male: side("male"), female: side("female"), missing };
}

/** 한 판의 모든 기준(전체 + 구간 4개)과 구간 1위 표 */
function viewsOf(
  rows: readonly TriathlonRankRow[],
  legsOf: (row: TriathlonRankRow) => TriathlonLegs | null,
): TriathlonViews {
  const total = rankBy(rows, legsOf, null);
  const legs = Object.fromEntries(
    TRIATHLON_LEGS.map((l) => [l.key, rankBy(rows, legsOf, l.key)]),
  ) as Record<TriathlonLegKey, TriathlonLegBoard>;

  const legLeaders: Record<string, TriathlonLegKey[]> = {};
  for (const l of TRIATHLON_LEGS) {
    for (const g of GENDERS) {
      const list = legs[l.key][g];
      for (const e of list.filter((x) => x.recordSec === list[0]?.recordSec)) {
        (legLeaders[e.memId] ??= []).push(l.key);
      }
    }
  }
  return { male: total.male, female: total.female, legs, legLeaders };
}

/**
 * 철인 판 전부 — 코스(킹·하프·올림픽)마다 남·녀 순위, 올림픽은 대회 묶음별 순위까지. 판마다 구간 기준 판도 함께.
 *
 * 순위는 **그 판 안에서 한 사람의 가장 빠른 기록**으로 매긴다. 그래서 「전체」와 「통영」의 1위가 다를 수 있고,
 * 통영을 두 번 뛴 사람은 통영 판에 빠른 쪽 하나로 선다. 구간 기준도 같다 — 사람당 그 판에서 그 구간이 가장 빠른
 * 기록 하나(완주 시간이 가장 빠른 기록과 다를 수 있다). 랭킹 RPC 행을 그대로 받는다(입단 전 기록 제외 등 산정
 * 규칙은 RPC가 이미 걸렀다). `detailOf`는 원본 기록에서 읽은 구간·묶음 이름 — 못 찾으면 구간 없음·「기타」.
 */
export function buildTriathlonBoards(
  rows: readonly TriathlonRankRow[],
  detailOf: (row: TriathlonRankRow) => { splits: TriathlonSplits | null; series: string | null } | undefined,
): TriathlonEventBoard[] {
  const legsOf = (r: TriathlonRankRow) => withTransition(detailOf(r)?.splits ?? null, r.recordSec);
  return TRIATHLON_EVENTS.map((evt) => {
    const mine = rows.filter((r) => r.evtCd === evt.eventType);
    const series: TriathlonSeriesBoard[] = [];
    if (evt.bySeries) {
      const groups = new Map<string, TriathlonRankRow[]>();
      for (const r of mine) {
        const label = detailOf(r)?.series ?? TRIATHLON_SERIES_ETC;
        groups.set(label, [...(groups.get(label) ?? []), r]);
      }
      for (const [label, g] of groups) series.push({ label, ...viewsOf(g, legsOf) });
    }
    return {
      eventType: evt.eventType,
      label: evt.label,
      ...viewsOf(mine, legsOf),
      series: sortTriathlonSeries(series),
    };
  });
}
