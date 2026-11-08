/**
 * 하이록스(HYROX) 종목 상수·판 계산 — 기강의 전당 하이록스 판과 운영 MCP 도구가 함께 쓴다.
 *
 * HYROX = 1km 런 × 8회 + 8개 펑셔널 스테이션을 번갈아 하는 종목. 기강은 **대회 기록만** 받는다
 * (연습 기록은 넣지 않는다 — #349 에서 확정). 그래서 기록은 다른 대회 기록과 같은 `rec_race_hist` 에 들고,
 * 완주 총시간(`rec_time_sec`)이 순위 기준이다. 스테이션 구간 기록은 선택값으로 `splits_json`
 * (`{스테이션코드: 초}`)에 담는다 — 런 8회·록스존은 총시간에 들어 있다고 보고 따로 받지 않는다.
 *
 * 회귀 테스트: `lib/__tests__/hyrox.test.ts`
 */

import { secondsToTime } from "@/lib/dayjs";

/** `comp_mst.comp_sprt_cd` 의 하이록스 스포츠 코드 */
export const HYROX_SPRT_CD = "hyrox";

/** 대회 스포츠 코드가 하이록스인가 */
export function isHyroxSport(sport: string | null | undefined): boolean {
  return (sport ?? "").trim().toLowerCase() === HYROX_SPRT_CD;
}

/* ------------------------------------------------------------------ */
/*  스테이션                                                           */
/* ------------------------------------------------------------------ */

/**
 * 8개 스테이션 — **공식 순서**. `code` 는 `splits_json` 의 키이고 MCP 인자 이름이기도 하다.
 * 키를 바꾸면 저장된 스플릿이 조용히 안 읽힌다(`parseHyroxSplits` 가 모르는 키를 버린다).
 */
export const HYROX_STATIONS = [
  { code: "SKIERG", label: "스키에르그", spec: "1000m" },
  { code: "SLED_PUSH", label: "썰매 밀기", spec: "50m" },
  { code: "SLED_PULL", label: "썰매 당기기", spec: "50m" },
  { code: "BURPEE", label: "버피 브로드점프", spec: "80m" },
  { code: "ROW", label: "로잉", spec: "1000m" },
  { code: "FARMERS_CARRY", label: "파머스 캐리", spec: "200m" },
  { code: "LUNGE", label: "샌드백 런지", spec: "100m" },
  { code: "WALL_BALL", label: "월볼", spec: "100회" },
] as const;

export type HyroxStationCode = (typeof HYROX_STATIONS)[number]["code"];

export const HYROX_STATION_CODES: readonly HyroxStationCode[] = HYROX_STATIONS.map((s) => s.code);

/** 스테이션 코드별 시간(초) */
export type HyroxSplits = Partial<Record<HyroxStationCode, number>>;

function isStationCode(key: string): key is HyroxStationCode {
  return (HYROX_STATION_CODES as readonly string[]).includes(key);
}

/**
 * `splits_json`(모양을 모르는 jsonb) → 검증된 `{스테이션코드: 초}`.
 * 알려진 스테이션 + 양수만 남기고 깨진 값은 버린다(한 칸이 깨졌다고 판 전체를 실패시키지 않는다).
 *
 * @param json DB 에서 읽은 값
 * @returns 남은 칸만 담은 맵(없으면 빈 객체)
 */
export function parseHyroxSplits(json: unknown): HyroxSplits {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: HyroxSplits = {};
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (!isStationCode(key)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    out[key] = Math.round(value);
  }
  return out;
}

/**
 * 입력의 `{스테이션코드: 초|null}` → 저장용 jsonb. 값이 있는 칸만 담고, 하나도 없으면 `null`
 * (컬럼을 비워 "스플릿 없음"이 빈 객체와 갈리지 않게).
 *
 * @param splits 폼·MCP 가 넘긴 값. 모르는 키는 버린다
 * @returns 저장할 객체 또는 `null`
 */
export function serializeHyroxSplits(
  splits: Partial<Record<string, number | null | undefined>> | null | undefined,
): HyroxSplits | null {
  if (!splits) return null;
  const out: HyroxSplits = {};
  for (const code of HYROX_STATION_CODES) {
    const value = splits[code];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      out[code] = Math.round(value);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 스테이션 합계(초) — 입력된 칸만 더한다. 칸이 하나도 없으면 `null` */
export function sumHyroxSplits(splits: HyroxSplits): number | null {
  const values = Object.values(splits).filter((v): v is number => typeof v === "number");
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
}

/* ------------------------------------------------------------------ */
/*  부문(판)                                                           */
/* ------------------------------------------------------------------ */

/**
 * 전당에 서는 부문 — 랭킹 코드는 RPC 가 `HYROX_` 접두어를 붙여 내린다.
 *
 * `byGender` — 오픈·프로는 남녀가 무게·종목 규정이 달라 남/여 판을 가른다. 더블스는 남·여·혼성 팀이
 * 섞이고 기록이 팀 기록이라 한 줄로 세운다. **릴레이는 판이 없다**(4인 팀 기록이라 개인 순위가 아니다) —
 * 저장은 되지만 전당엔 안 선다.
 */
export const HYROX_DIVISIONS = [
  { eventType: "HYROX_OPEN", code: "OPEN", label: "오픈", byGender: true },
  { eventType: "HYROX_PRO", code: "PRO", label: "프로", byGender: true },
  { eventType: "HYROX_DOUBLES", code: "DOUBLES", label: "더블스", byGender: false },
] as const;

/** 기록 등록에서 고를 수 있는 부문 — 판이 없는 릴레이도 저장은 된다 */
export const HYROX_RECORD_DIVISIONS = ["OPEN", "PRO", "DOUBLES", "RELAY"] as const;
export type HyroxRecordDivision = (typeof HYROX_RECORD_DIVISIONS)[number];

/** 하이록스 판 RPC(`get_public_team_hyrox_rankings`) 한 행 */
export type HyroxRankingRow = {
  race_result_id: string;
  mem_id: string;
  mem_nm: string | null;
  gdr_enm: string | null;
  evt_cd: string | null;
  rec_time_sec: number;
  race_nm: string | null;
  race_dt: string | null;
  splits_json: unknown;
};

export type HyroxEntry = {
  rank: number;
  memId: string;
  name: string;
  record: string;
  recordSec: number;
  raceName: string | null;
  raceDt: string | null;
  splits: HyroxSplits;
};

export type HyroxBoard = {
  eventType: string;
  label: string;
  byGender: boolean;
  /** `byGender` 판 */
  male: HyroxEntry[];
  female: HyroxEntry[];
  /** 성별 없는 판(더블스) */
  all: HyroxEntry[];
};

/**
 * 하이록스 판 계산 — 부문마다 **사람당 가장 빠른 기록 하나**를 뽑아 순위를 매긴다.
 *
 * 동률은 먼저 뛴 기록(대회일 오름차순) → 이름순. 순위 숫자는 동률이어도 1, 2, 3 으로 이어 붙인다
 * (마라톤 판과 같은 규칙).
 *
 * @param rows 하이록스 판 RPC 결과
 * @returns `HYROX_DIVISIONS` 순서의 판 목록(기록이 없는 부문도 빈 판으로 남는다)
 */
export function buildHyroxBoards(rows: readonly HyroxRankingRow[]): HyroxBoard[] {
  const best = new Map<string, HyroxRankingRow>();
  for (const row of rows) {
    const evt = row.evt_cd?.toUpperCase() ?? "";
    if (!evt || !row.mem_id || !(row.rec_time_sec > 0)) continue;
    const key = `${evt}_${row.mem_id}`;
    const prev = best.get(key);
    if (!prev || compareRows(row, prev) < 0) best.set(key, row);
  }

  const toEntries = (list: HyroxRankingRow[]): HyroxEntry[] =>
    [...list].sort(compareRows).map((r, i) => ({
      rank: i + 1,
      memId: r.mem_id,
      name: r.mem_nm ?? "",
      record: secondsToTime(r.rec_time_sec),
      recordSec: r.rec_time_sec,
      raceName: r.race_nm ?? null,
      raceDt: r.race_dt ?? null,
      splits: parseHyroxSplits(r.splits_json),
    }));

  const all = [...best.values()];
  return HYROX_DIVISIONS.map((div) => {
    const mine = all.filter((r) => r.evt_cd?.toUpperCase() === div.eventType);
    return {
      eventType: div.eventType,
      label: div.label,
      byGender: div.byGender,
      // 성별을 모르는 사람은 마라톤 판과 같이 남자 판에 세운다
      male: div.byGender ? toEntries(mine.filter((r) => r.gdr_enm !== "female")) : [],
      female: div.byGender ? toEntries(mine.filter((r) => r.gdr_enm === "female")) : [],
      all: div.byGender ? [] : toEntries(mine),
    };
  });
}

function compareRows(a: HyroxRankingRow, b: HyroxRankingRow): number {
  if (a.rec_time_sec !== b.rec_time_sec) return a.rec_time_sec - b.rec_time_sec;
  const ad = a.race_dt ?? "";
  const bd = b.race_dt ?? "";
  if (ad !== bd) return ad < bd ? -1 : 1;
  return (a.mem_nm ?? "").localeCompare(b.mem_nm ?? "", "ko");
}

/* ------------------------------------------------------------------ */
/*  구경용 보기 — 정렬 기준 · 스테이션 킹 · 스테이션별 격차              */
/* ------------------------------------------------------------------ */

/** 판을 세우는 기준 — 총시간 또는 스테이션 하나 */
export type HyroxSortKey = "TOTAL" | HyroxStationCode;

/** 기준을 적용한 행 — `record`/`recordSec` 은 **기준 값**(스테이션이면 그 스테이션 시간)이고 총시간은 따로 든다 */
export type HyroxViewEntry = HyroxEntry & { totalRecord: string; totalSec: number };

export type HyroxView = {
  /** 기준 값이 있는 사람 — 순위를 다시 매긴다 */
  ranked: HyroxViewEntry[];
  /** 스테이션 기준인데 그 칸을 안 넣은 사람 — 순위 없이 뒤에 선다(총시간 기준이면 늘 빈 배열) */
  missing: HyroxViewEntry[];
};

/**
 * 한 목록(남·여·더블스)을 기준대로 다시 세운다.
 *
 * 스테이션 기준이면 그 칸이 있는 사람만 순위에 서고(동률은 총시간 순위가 앞선 사람), 칸을 안 넣은 사람은
 * `missing` 으로 뺀다 — 0초나 꼴찌로 세우면 "그 스테이션을 못했다"로 읽힌다.
 *
 * @param entries `buildHyroxBoards` 의 한 목록(총시간 순)
 * @param key 정렬 기준
 */
export function viewHyroxBy(entries: readonly HyroxEntry[], key: HyroxSortKey): HyroxView {
  const withTotal = entries.map((e) => ({ ...e, totalRecord: e.record, totalSec: e.recordSec }));
  if (key === "TOTAL") return { ranked: withTotal, missing: [] };

  const has = withTotal.filter((e) => typeof e.splits[key] === "number");
  const missing = withTotal.filter((e) => typeof e.splits[key] !== "number");
  const ranked = [...has]
    .sort((a, b) => (a.splits[key] as number) - (b.splits[key] as number) || a.rank - b.rank)
    .map((e, i) => {
      const sec = e.splits[key] as number;
      return { ...e, rank: i + 1, record: secondsToTime(sec), recordSec: sec };
    });
  return { ranked, missing };
}

/** 이 목록에서 그 스테이션을 넣은 사람이 하나라도 있나 — 정렬 칩을 켤지 정한다 */
export function hasHyroxStation(entries: readonly HyroxEntry[], code: HyroxStationCode): boolean {
  return entries.some((e) => typeof e.splits[code] === "number");
}

export type HyroxStationHolder = { memId: string; name: string; sec: number };

/**
 * 스테이션마다 팀 최고 기록 보유자 — 목록 하나 기준(남·여·더블스 각각 부른다).
 * 동률이면 총시간 순위가 앞선 사람.
 */
export function hyroxStationHolders(
  entries: readonly HyroxEntry[],
): Record<HyroxStationCode, HyroxStationHolder | null> {
  const out = {} as Record<HyroxStationCode, HyroxStationHolder | null>;
  for (const code of HYROX_STATION_CODES) {
    const top = viewHyroxBy(entries, code).ranked[0];
    out[code] = top ? { memId: top.memId, name: top.name, sec: top.recordSec } : null;
  }
  return out;
}

export type HyroxGapRow = {
  code: HyroxStationCode;
  /** 이 사람의 스테이션 시간 */
  sec: number | null;
  /** 기준 1위보다(+ 느림 / - 빠름). 비교할 칸이 없거나 본인이 1위면 `null` */
  vsLeader: number | null;
  /** 기준 바로 위 사람보다 */
  vsAbove: number | null;
};

export type HyroxGaps = {
  rows: HyroxGapRow[];
  /** 비교 대상 — 화면 머리글에 이름을 쓴다 */
  leader: { memId: string; name: string } | null;
  above: { memId: string; name: string } | null;
  /** 1위보다 가장 많이 잃은 스테이션(잃은 곳이 없으면 `null`) */
  worst: HyroxStationCode | null;
};

/**
 * 한 사람의 스테이션별 격차 — "어디서 시간을 잃나".
 *
 * 비교 대상은 **지금 보는 기준의** 1위와 바로 위 사람이다(총시간이면 총시간 순위, 스테이션이면 그 스테이션 순위).
 * 기준 칸이 없어 순위에 못 선 사람(`missing`)은 1위하고만 비교한다.
 *
 * @param view `viewHyroxBy` 결과(이 사람이 들어 있는 목록)
 * @param memId 펼친 사람
 */
export function hyroxSplitGaps(view: HyroxView, memId: string): HyroxGaps | null {
  const idx = view.ranked.findIndex((e) => e.memId === memId);
  const me = idx >= 0 ? view.ranked[idx] : view.missing.find((e) => e.memId === memId);
  if (!me) return null;

  const leaderEntry = view.ranked[0] && view.ranked[0].memId !== memId ? view.ranked[0] : null;
  const aboveEntry = idx > 0 ? view.ranked[idx - 1] : null;
  const diff = (other: HyroxEntry | null, code: HyroxStationCode, sec: number | null) => {
    const o = other?.splits[code];
    return sec != null && typeof o === "number" ? sec - o : null;
  };

  let worst: HyroxStationCode | null = null;
  let worstGap = 0;
  const rows = HYROX_STATION_CODES.map((code) => {
    const sec = me.splits[code] ?? null;
    const vsLeader = diff(leaderEntry, code, sec);
    if (vsLeader != null && vsLeader > worstGap) {
      worstGap = vsLeader;
      worst = code;
    }
    return { code, sec, vsLeader, vsAbove: diff(aboveEntry, code, sec) };
  });

  const pick = (e: HyroxEntry | null) => (e ? { memId: e.memId, name: e.name } : null);
  return { rows, leader: pick(leaderEntry), above: pick(aboveEntry), worst };
}

/** 격차 초 → `+0:12` / `-0:03` / `0:00`. 부호가 곧 방향이다(시간은 적을수록 좋다) */
export function formatHyroxGap(sec: number): string {
  if (sec === 0) return "0:00";
  return `${sec > 0 ? "+" : "-"}${secondsToTime(Math.abs(sec))}`;
}
