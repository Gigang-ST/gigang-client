import { z } from "zod";

/**
 * 신입 시작 정보(이슈 #719) — 러닝 경력·주간 거리·자기신고 기록. **전부 선택 입력**이다.
 * DB CHECK 제약(`20261120150000_member_start_info.sql`)과 같은 목록 — 한쪽을 고치면 다른 쪽도 고친다.
 *
 * 기록은 본인이 적은 **시작점 기준선**이다. 대회 기록(`rec_race_hist`)과 섞지 않고(별도 테이블
 * `mem_start_rec_rel`), 랭킹·칭호·포인트에도 쓰지 않는다.
 */

/** 러닝 경력 */
export const RUN_CAREER_CODES = ["NEW", "UNDER_1Y", "Y1_3", "OVER_3Y"] as const;
export type RunCareerCode = (typeof RUN_CAREER_CODES)[number];
export const RUN_CAREER_LABELS: Record<RunCareerCode, string> = {
  NEW: "처음이에요",
  UNDER_1Y: "1년 미만",
  Y1_3: "1~3년",
  OVER_3Y: "3년 이상",
};

/** 평소 주간 거리 — 월 200km 이상 뛰는 회원도 담기게 맨 위 구간은 50km 이상 */
export const WKLY_DIST_CODES = ["ZERO", "UNDER_10", "KM10_30", "KM30_50", "OVER_50"] as const;
export type WklyDistCode = (typeof WKLY_DIST_CODES)[number];
export const WKLY_DIST_LABELS: Record<WklyDistCode, string> = {
  ZERO: "거의 안 뛰어요",
  UNDER_10: "10km까지",
  KM10_30: "10~30km",
  KM30_50: "30~50km",
  OVER_50: "50km 이상",
};

/** 기록 거리 — 기본 10K, 바꿀 수 있다 */
export const START_REC_DIST_CODES = ["10K", "HALF", "FULL", "5K"] as const;
export type StartRecDistCode = (typeof START_REC_DIST_CODES)[number];
export const START_REC_DIST_LABELS: Record<StartRecDistCode, string> = {
  "10K": "10K",
  HALF: "하프",
  FULL: "풀",
  "5K": "5K",
};
export const DEFAULT_START_REC_DIST: StartRecDistCode = "10K";

/** 시작 정보를 처음 받은 곳 */
export const START_INFO_SRC_CODES = ["SIGNUP", "PROFILE"] as const;
export type StartInfoSrcCode = (typeof START_INFO_SRC_CODES)[number];
export const START_INFO_SRC_LABELS: Record<StartInfoSrcCode, string> = {
  SIGNUP: "가입 때",
  PROFILE: "프로필에서",
};

/** 기록 허용 범위(초) — DB `ck_mem_start_rec_rel_rec_sec` 와 같다 */
export const START_REC_MIN_SEC = 600;
export const START_REC_MAX_SEC = 86400;

export const startRecordSchema = z.object({
  distCd: z.enum(START_REC_DIST_CODES),
  recSec: z.number().int().min(START_REC_MIN_SEC).max(START_REC_MAX_SEC),
});

export const startInfoSchema = z
  .object({
    runCareerCd: z.enum(RUN_CAREER_CODES).nullable(),
    wklyDistCd: z.enum(WKLY_DIST_CODES).nullable(),
    /** "아직 완주 못 해봄" — true 면 기록 목록은 비어 있어야 한다 */
    recNone: z.boolean(),
    records: z.array(startRecordSchema).max(START_REC_DIST_CODES.length),
  })
  .refine((v) => !(v.recNone && v.records.length > 0), {
    message: "완주 못 해봄과 기록은 함께 낼 수 없어요.",
  })
  .refine((v) => new Set(v.records.map((r) => r.distCd)).size === v.records.length, {
    message: "같은 거리 기록이 중복됐어요.",
  });

export type StartInfoValues = z.infer<typeof startInfoSchema>;

export const EMPTY_START_INFO: StartInfoValues = {
  runCareerCd: null,
  wklyDistCd: null,
  recNone: false,
  records: [],
};

/** 하나라도 입력했는가 — 비어 있으면 저장·입력 시각 기록을 건너뛴다 */
export function hasStartInfo(v: StartInfoValues): boolean {
  return v.runCareerCd !== null || v.wklyDistCd !== null || v.recNone || v.records.length > 0;
}

/**
 * 기록 입력 문자열 → 초. `55:30`(분:초) · `1:55:30`(시:분:초) 형식. 못 읽으면 null.
 * 범위(10분~24시간) 밖이어도 null — 선택 필드가 가입을 막지 않게 호출부가 "미입력"으로 다룬다.
 */
export function parseRecTime(input: string): number | null {
  const m = input.trim().match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{1,2})$/);
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const s = Number(m[3]);
  if (s > 59) return null;
  if (m[1] && min > 59) return null;
  const sec = h * 3600 + min * 60 + s;
  return sec >= START_REC_MIN_SEC && sec <= START_REC_MAX_SEC ? sec : null;
}

/** 초 → `55:30` / `1:55:30` */
export function formatRecTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** 폼 입력 상태 — 기록 칸은 시간을 문자열로 들고 있다 */
export type StartInfoDraft = {
  runCareerCd: RunCareerCode | null;
  wklyDistCd: WklyDistCode | null;
  recNone: boolean;
  rows: { distCd: StartRecDistCode; timeInput: string }[];
};

export const EMPTY_START_INFO_DRAFT: StartInfoDraft = {
  runCareerCd: null,
  wklyDistCd: null,
  recNone: false,
  rows: [{ distCd: DEFAULT_START_REC_DIST, timeInput: "" }],
};

export function draftFromValues(v: StartInfoValues): StartInfoDraft {
  return {
    runCareerCd: v.runCareerCd,
    wklyDistCd: v.wklyDistCd,
    recNone: v.recNone,
    rows:
      v.records.length > 0
        ? v.records.map((r) => ({ distCd: r.distCd, timeInput: formatRecTime(r.recSec) }))
        : [{ distCd: DEFAULT_START_REC_DIST, timeInput: "" }],
  };
}

/** 입력 상태 → 제출 값. 빈 칸·못 읽는 시간은 버리고, 같은 거리는 앞의 것만 남긴다. */
export function draftToValues(d: StartInfoDraft): StartInfoValues {
  if (d.recNone) {
    return { runCareerCd: d.runCareerCd, wklyDistCd: d.wklyDistCd, recNone: true, records: [] };
  }
  const seen = new Set<StartRecDistCode>();
  const records: StartInfoValues["records"] = [];
  for (const row of d.rows) {
    const sec = parseRecTime(row.timeInput);
    if (sec === null || seen.has(row.distCd)) continue;
    seen.add(row.distCd);
    records.push({ distCd: row.distCd, recSec: sec });
  }
  return { runCareerCd: d.runCareerCd, wklyDistCd: d.wklyDistCd, recNone: false, records };
}

/** 시간 칸에 뭔가 적었는데 못 읽는 행의 인덱스 — 화면이 안내를 붙인다 */
export function invalidTimeRows(d: StartInfoDraft): number[] {
  if (d.recNone) return [];
  return d.rows.flatMap((r, i) => (r.timeInput.trim() !== "" && parseRecTime(r.timeInput) === null ? [i] : []));
}
