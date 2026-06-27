/**
 * 하이록스(HYROX) 종목 상수·헬퍼.
 *
 * HYROX = 1km 런 × 8회 + 8개 펑셔널 스테이션을 번갈아 수행하는 하이브리드 종목.
 * 기강에서는 완주 총시간(`rec_race_hist.rec_time_sec`)을 랭킹 기준으로 쓰고,
 * 스테이션별 구간기록은 `rec_race_hist.splits_json`(jsonb)에 `{스테이션코드: 초}` 형태로 저장한다.
 * (런 8회·록스존은 입력 범위 밖 — 총시간에 포함된 것으로 간주)
 */

/** `comp_mst.comp_sprt_cd` 의 하이록스 스포츠 코드 */
export const HYROX_SPRT_CD = "hyrox";

/** 하이록스 여부 (대회 sport 문자열 기준) */
export function isHyroxSport(sport: string | null | undefined): boolean {
  return (sport ?? "").toLowerCase().includes(HYROX_SPRT_CD);
}

/** 하이록스 8개 스테이션 (공식 순서). code 는 `splits_json` 의 키로 쓴다. */
export const HYROX_STATIONS = [
  { code: "SKIERG", label: "스키에르그", spec: "1000m" },
  { code: "SLED_PUSH", label: "썰매 밀기", spec: "50m" },
  { code: "SLED_PULL", label: "썰매 당기기", spec: "50m" },
  { code: "BURPEE", label: "버피 브로드점프", spec: "80m" },
  { code: "ROW", label: "로잉", spec: "1000m" },
  { code: "FARMERS_CARRY", label: "파머스 캐리", spec: "200m" },
  { code: "LUNGE", label: "샌드백 런지", spec: "100m" },
  { code: "WALL_BALL", label: "월볼", spec: "100reps" },
] as const;

export type HyroxStationCode = (typeof HYROX_STATIONS)[number]["code"];

const HYROX_STATION_CODES: readonly string[] = HYROX_STATIONS.map((s) => s.code);

/** 스테이션 코드별 시간(초) 맵 */
export type HyroxSplits = Partial<Record<HyroxStationCode, number>>;

/**
 * `splits_json`(jsonb, 알 수 없는 모양) → 검증된 `{스테이션코드: 초}` 맵.
 * 알려진 스테이션 코드 + 양의 정수만 남긴다. 깨진 값은 조용히 버린다.
 */
export function parseHyroxSplits(json: unknown): HyroxSplits {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: HyroxSplits = {};
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (!HYROX_STATION_CODES.includes(key)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    out[key as HyroxStationCode] = Math.round(value);
  }
  return out;
}

/**
 * 입력 폼의 `{스테이션코드: 초|null}` → DB 저장용 jsonb 객체.
 * 값이 있는(양의 정수) 스테이션만 담는다. 하나도 없으면 null 을 반환해 컬럼을 비운다.
 */
export function serializeHyroxSplits(
  splits: Partial<Record<string, number | null>>,
): HyroxSplits | null {
  const out: HyroxSplits = {};
  for (const station of HYROX_STATIONS) {
    const value = splits[station.code];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      out[station.code] = Math.round(value);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
