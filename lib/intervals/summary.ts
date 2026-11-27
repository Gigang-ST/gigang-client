/**
 * intervals.icu 활동 요약 표시 규칙(#760) — 종목 라벨·페이스·시간·거리.
 * 화면(프로필 「최근 운동」)과 운영 MCP 가 같은 함수를 쓴다(한쪽만 고쳐 어긋나지 않게).
 */

export type ActivitySummaryRow = {
  icu_act_id: string;
  act_dt: string;
  sprt_type_nm: string;
  dst_m: number | null;
  mov_sec: number | null;
  avg_spd_mps: number | null;
};

const SPORT_LABEL: Record<string, string> = {
  Run: "러닝",
  VirtualRun: "러닝",
  TrailRun: "트레일러닝",
  Walk: "걷기",
  Hike: "하이킹",
  Ride: "사이클",
  VirtualRide: "사이클",
  MountainBikeRide: "사이클",
  GravelRide: "사이클",
  EBikeRide: "사이클",
  Swim: "수영",
  OpenWaterSwim: "수영",
  WeightTraining: "근력",
  Workout: "운동",
  Yoga: "요가",
  Rowing: "로잉",
  Crossfit: "크로스핏",
  HIIT: "인터벌",
};

export function sportLabel(type: string): string {
  return SPORT_LABEL[type] ?? "운동";
}

type PaceKind = "run" | "swim" | "ride" | null;

function paceKind(type: string): PaceKind {
  if (type === "Run" || type === "VirtualRun" || type === "TrailRun" || type === "Walk" || type === "Hike") return "run";
  if (type === "Swim" || type === "OpenWaterSwim") return "swim";
  if (/Ride$/.test(type)) return "ride";
  return null;
}

function mmss(totalSec: number): string {
  const s = Math.round(totalSec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 거리(km) 한 자리 — 거리 없으면 null */
export function formatDistanceKm(distM: number | null): string | null {
  if (distM == null || distM <= 0) return null;
  return `${(distM / 1000).toFixed(distM >= 100_000 ? 0 : 1)}km`;
}

/** 움직인 시간 — 1:05:30 / 32:10 */
export function formatDuration(sec: number | null): string | null {
  if (sec == null || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * 페이스 — 종목에 맞는 단위로. 러닝류 5:30/km · 수영 2:10/100m · 사이클 28.4km/h.
 * 속도를 모르거나 종목에 페이스 개념이 없으면 null(근력·요가 등).
 */
export function formatPace(type: string, avgSpdMps: number | null): string | null {
  if (avgSpdMps == null || avgSpdMps <= 0) return null;
  const kind = paceKind(type);
  if (kind === "run") return `${mmss(1000 / avgSpdMps)}/km`;
  if (kind === "swim") return `${mmss(100 / avgSpdMps)}/100m`;
  if (kind === "ride") return `${(avgSpdMps * 3.6).toFixed(1)}km/h`;
  return null;
}

/** 운영 MCP 응답용 — 키·심박·경로 없이 요약 필드만. */
export function toSummaryJson(row: ActivitySummaryRow) {
  return {
    date: row.act_dt,
    sport: row.sprt_type_nm,
    sport_label: sportLabel(row.sprt_type_nm),
    distance_km: row.dst_m != null ? Math.round(row.dst_m / 10) / 100 : null,
    duration: formatDuration(row.mov_sec),
    pace: formatPace(row.sprt_type_nm, row.avg_spd_mps),
  };
}
