import { compEvtTypeKm, normalizeCompEvtTypeKey, toRankingEvtCd } from "@/lib/comp-evt-type";
import { dayjs } from "@/lib/dayjs";
import { isHyroxRecordDivision } from "@/lib/hyrox";

/**
 * 관리자 기록관리 목록의 **보기 규칙** — 정렬·필터·이상 기록 판정(#679).
 *
 * 화면은 그리기만 하고 숫자 규칙은 전부 여기서 정한다(순수 함수 — 회귀 테스트가 지킨다).
 * 이상 기록은 **표시만** 한다. 막거나 고치지 않는다 — 관리자가 눈으로 확인하고 상세에서 수정·삭제한다.
 */

/** 목록 한 줄 */
export type AdminRecordRow = {
  id: string;
  memId: string;
  memNm: string | null;
  compId: string;
  /** 대회 스포츠(`comp_mst.comp_sprt_cd`). 모르면 null */
  sprtCd: string | null;
  /** 저장된 종목 코드(정규화) — 예: `FULL` */
  evtCd: string;
  /** 배지 문자열 — `스포츠 · 코드` (`adminRecordEventLabel`) */
  eventLabel: string;
  recordTimeSec: number;
  raceName: string | null;
  /** 대회일(date 컬럼 `YYYY-MM-DD`) */
  raceDate: string | null;
  /** 등록 시각(timestamptz) */
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* 이상 기록 기준값 — 한곳에 둔다(PR 본문에도 같은 표를 적는다)        */
/* ------------------------------------------------------------------ */

const H = 3600;
const M = 60;

/**
 * 종목별 **비현실적 시간** 범위 `[이보다 빠르면, 이보다 느리면]`(초). 키는 랭킹 코드(`toRankingEvtCd`).
 *
 * 빠른 쪽은 세계기록보다 조금 아래(풀 2:00:35 → 2시간), 느린 쪽은 대회 컷오프를 넉넉히 넘긴 값이다.
 * 오입력(분을 시로, 하프를 풀로)을 잡는 게 목적이라 경계에 걸리는 진짜 기록이 없도록 넉넉히 잡았다.
 * 느린 쪽이 없는(null) 종목은 컷오프가 대회마다 달라 빠른 쪽만 본다.
 */
export const RECORD_TIME_BOUNDS: Record<string, readonly [number, number | null]> = {
  FULL: [2 * H, 7 * H],
  HALF: [57 * M, 3.5 * H],
  "10K": [25 * M, 2 * H],
  "5K": [12 * M, 1 * H],
  TRIATHLON_FULL: [7 * H, 17 * H],
  TRIATHLON_HALF: [3 * H, 8.5 * H],
  TRIATHLON_OLYMPIC: [1.5 * H, 4.5 * H],
  TRIATHLON_SPRINT: [45 * M, 2.5 * H],
  HYROX_OPEN: [50 * M, 3 * H],
  HYROX_DOUBLES: [45 * M, 3 * H],
  HYROX_RELAY: [45 * M, 3 * H],
};

/**
 * 위 표에 없는 **달리기 거리 종목**(`37K`·`100K`·`100M` 등 — 트레일·울트라)의 하한 페이스(초/km).
 * 2'30"/km 보다 빠르면 비현실적으로 본다(100K 세계기록이 약 3'39"/km). 느린 쪽은 보지 않는다(트레일은 끝없이 느릴 수 있다).
 */
export const RUNNING_MIN_SEC_PER_KM = 150;

/** 달리기로 보는 스포츠 — 거리 종목 페이스 판정을 여기에만 건다(사이클 `80K` 를 달리기로 재지 않게) */
const RUNNING_SPORTS = new Set(["road_run", "ultra", "trail_run"]);

/** 스포츠별 **표준 종목 코드**(공통코드 `*_EVT_CD` + 옛 `TRIATHLON_*`·`HYROX_*`). 불일치 판정에만 쓴다. */
const SPORT_STANDARD_CODES: Record<string, ReadonlySet<string>> = {
  road_run: new Set(["5K", "10K", "HALF", "FULL"]),
  ultra: new Set(["50K", "80K", "100K", "100M"]),
  trail_run: new Set(["20K", "50K", "100K", "100M"]),
  triathlon: new Set([
    "SPRINT",
    "OLYMPIC",
    "HALF",
    "FULL",
    "TRIATHLON_SPRINT",
    "TRIATHLON_OLYMPIC",
    "TRIATHLON_HALF",
    "TRIATHLON_FULL",
  ]),
  cycling: new Set(["GRANFONDO", "MEDIOFONDO", "ROAD_RACE", "ROAD RACE", "TIME_TRIAL", "TIME TRIAL", "CRITERIUM"]),
  hyrox: new Set(["OPEN", "DOUBLES", "RELAY", "HYROX_OPEN", "HYROX_DOUBLES", "HYROX_RELAY"]),
};

/** 거리로 적힌 종목(`37K`·`21.1K`·`100M`) — 어느 스포츠에서든 직접 입력할 수 있어 불일치로 보지 않는다 */
const DISTANCE_CODE_RE = /^\d+(?:\.\d+)?[KM]$/;

/* ------------------------------------------------------------------ */
/* 이상 기록 판정                                                      */
/* ------------------------------------------------------------------ */

export type RecordIssueKind = "too_fast" | "too_slow" | "duplicate" | "sport_mismatch";

export type RecordIssue = { kind: RecordIssueKind; label: string; detail: string };

/** 배지 문구(짧게) — 줄에 붙는다 */
export const RECORD_ISSUE_LABEL: Record<RecordIssueKind, string> = {
  too_fast: "너무 빠름",
  too_slow: "너무 느림",
  duplicate: "중복",
  sport_mismatch: "종목 불일치",
};

/** 종목 코드가 대회 스포츠와 안 맞는가. 스포츠를 모르면 판정하지 않는다. */
export function isSportMismatch(sprtCd: string | null, evtCd: string): boolean {
  if (!sprtCd) return false;
  const sport = sprtCd.toLowerCase();
  const code = normalizeCompEvtTypeKey(evtCd);
  if (!code) return false;
  // 하이록스는 코스가 부문 코드(OPEN·DOUBLES·RELAY)만이어야 한다 — 대회 등록 검사와 같은 기준(#671)
  if (sport === "hyrox") return !isHyroxRecordDivision(code.replace(/^HYROX_/, ""));
  const own = SPORT_STANDARD_CODES[sport];
  if (!own || own.has(code) || DISTANCE_CODE_RE.test(code)) return false;
  // 다른 스포츠의 표준 코드일 때만 불일치다(예: 로드 런 대회에 OLYMPIC). 처음 보는 직접 입력 코드는 두지 않는다
  return Object.entries(SPORT_STANDARD_CODES).some(([s, codes]) => s !== sport && codes.has(code));
}

/** 시간 범위 판정 — 걸리면 그 이슈, 아니면 null */
export function timeIssue(sprtCd: string | null, evtCd: string, sec: number): RecordIssue | null {
  const sport = sprtCd?.toLowerCase() ?? null;
  const rankCd = toRankingEvtCd(sport, evtCd);
  const bounds = RECORD_TIME_BOUNDS[rankCd];
  // 로드 코드(FULL·HALF·10K·5K)는 로드 런 대회일 때만 잰다 — 스포츠를 모르는 FULL 을 마라톤으로 재면 철인이 "너무 느림"이 된다.
  // 철인·하이록스는 랭킹 코드(`TRIATHLON_*`·`HYROX_*`)로 바뀌어 들어오므로 스포츠가 이미 갈려 있다
  const applies = /^(TRIATHLON|HYROX)_/.test(rankCd) || sport === "road_run";
  if (bounds && applies) {
    const [min, max] = bounds;
    if (sec < min) return { kind: "too_fast", label: RECORD_ISSUE_LABEL.too_fast, detail: `이 종목은 ${fmt(min)}보다 빠르기 어려워요` };
    if (max != null && sec > max) return { kind: "too_slow", label: RECORD_ISSUE_LABEL.too_slow, detail: `이 종목은 보통 ${fmt(max)} 안에 들어와요` };
    return null;
  }
  if (sport && RUNNING_SPORTS.has(sport)) {
    const km = compEvtTypeKm(evtCd);
    if (km && sec < km * RUNNING_MIN_SEC_PER_KM) {
      return { kind: "too_fast", label: RECORD_ISSUE_LABEL.too_fast, detail: `${km}km 를 ${fmt(km * RUNNING_MIN_SEC_PER_KM)}보다 빨리 뛰기는 어려워요` };
    }
  }
  return null;
}

function fmt(sec: number): string {
  const h = Math.floor(sec / H);
  const m = Math.round((sec % H) / M);
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 중복 판정 키 — 같은 회원·같은 대회·같은 종목(랭킹 코드라 철인 FULL 과 TRIATHLON_FULL 도 같은 것으로 본다) */
function duplicateKey(r: AdminRecordRow): string {
  return `${r.memId}|${r.compId}|${toRankingEvtCd(r.sprtCd?.toLowerCase() ?? null, r.evtCd)}`;
}

/** 줄마다 걸린 이상들. 이상이 없는 줄은 맵에 없다. */
export function findRecordIssues(rows: readonly AdminRecordRow[]): Map<string, RecordIssue[]> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(duplicateKey(r), (counts.get(duplicateKey(r)) ?? 0) + 1);

  const out = new Map<string, RecordIssue[]>();
  for (const r of rows) {
    const issues: RecordIssue[] = [];
    const t = timeIssue(r.sprtCd, r.evtCd, r.recordTimeSec);
    if (t) issues.push(t);
    const n = counts.get(duplicateKey(r)) ?? 0;
    if (n > 1) {
      issues.push({ kind: "duplicate", label: RECORD_ISSUE_LABEL.duplicate, detail: `같은 회원·대회·종목 기록이 ${n}건 있어요` });
    }
    if (isSportMismatch(r.sprtCd, r.evtCd)) {
      issues.push({ kind: "sport_mismatch", label: RECORD_ISSUE_LABEL.sport_mismatch, detail: "대회 종목과 기록 종목 코드가 맞지 않아요" });
    }
    if (issues.length > 0) out.set(r.id, issues);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 정렬·필터                                                          */
/* ------------------------------------------------------------------ */

export type RecordSort = "created" | "race_date" | "time";

export const RECORD_SORT_OPTIONS: { value: RecordSort; label: string }[] = [
  { value: "created", label: "등록순" },
  { value: "race_date", label: "대회일순" },
  { value: "time", label: "기록 빠른순" },
];

/** 정렬 — 등록순·대회일순은 최신부터, 기록순은 빠른 것부터. 같으면 등록 최신순. */
export function sortRecords(rows: readonly AdminRecordRow[], sort: RecordSort): AdminRecordRow[] {
  const byCreated = (a: AdminRecordRow, b: AdminRecordRow) =>
    b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  return [...rows].sort((a, b) => {
    if (sort === "race_date") {
      const d = (b.raceDate ?? "").localeCompare(a.raceDate ?? "");
      if (d !== 0) return d;
    } else if (sort === "time") {
      const d = a.recordTimeSec - b.recordTimeSec;
      if (d !== 0) return d;
    }
    return byCreated(a, b);
  });
}

export const ALL = "all";

/** 대회일(date 컬럼)의 연도 문자열. date-only 라 어느 타임존에서도 같은 날로 읽힌다 */
function yearOf(raceDate: string | null): string | null {
  return raceDate ? String(dayjs(raceDate).year()) : null;
}

/** 기간 — `all` · `recent3m`(최근 3개월) · 연도(`2026`) */
export type RecordPeriod = string;

/** 기간 선택지 — 전체 · 최근 3개월 · 기록이 있는 연도(최신부터) */
export function periodOptions(rows: readonly AdminRecordRow[]): { value: RecordPeriod; label: string }[] {
  const years = [...new Set(rows.map((r) => yearOf(r.raceDate)).filter((y): y is string => !!y))].sort(
    (a, b) => b.localeCompare(a),
  );
  return [
    { value: ALL, label: "전체 기간" },
    { value: "recent3m", label: "최근 3개월" },
    ...years.map((y) => ({ value: y, label: `${y}년` })),
  ];
}

/** 종목 선택지 — 목록에 있는 배지 문자열, 많은 순(같으면 가나다순) */
export function eventOptions(rows: readonly AdminRecordRow[]): { value: string; label: string }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.eventLabel, (counts.get(r.eventLabel) ?? 0) + 1);
  const labels = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
  return [{ value: ALL, label: "전체 종목" }, ...labels.map(([l, n]) => ({ value: l, label: `${l} (${n})` }))];
}

export type RecordFilter = {
  search: string;
  event: string;
  period: RecordPeriod;
  issuesOnly: boolean;
};

/**
 * 거르기. `today` 는 KST 오늘(`YYYY-MM-DD`) — 「최근 3개월」 경계에 쓴다(호출부가 `todayKST()` 로 넘긴다).
 */
export function filterRecords(
  rows: readonly AdminRecordRow[],
  filter: RecordFilter,
  issues: ReadonlyMap<string, unknown>,
  today: string,
): AdminRecordRow[] {
  const q = filter.search.trim().toLowerCase();
  const recentFrom = dayjs(today).subtract(3, "month").format("YYYY-MM-DD");
  return rows.filter((r) => {
    if (filter.issuesOnly && !issues.has(r.id)) return false;
    if (filter.event !== ALL && r.eventLabel !== filter.event) return false;
    if (filter.period === "recent3m") {
      if (!r.raceDate || r.raceDate < recentFrom) return false;
    } else if (filter.period !== ALL) {
      if (yearOf(r.raceDate) !== filter.period) return false;
    }
    if (!q) return true;
    return (
      !!r.memNm?.toLowerCase().includes(q) ||
      !!r.raceName?.toLowerCase().includes(q) ||
      r.eventLabel.toLowerCase().includes(q)
    );
  });
}
