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
