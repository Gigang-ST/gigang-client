// lib/mileage-recap.ts — 마일리지런 시즌 돌아보기(회고) 계산 (순수 함수)
//
// 시즌이 끝난 뒤 크루 전체가 "우리가 뭘 했더라"를 재미로 훑는 지면(`/projects/recap`)의 숫자를
// 전부 여기서 만든다. **오로지 재미와 추억을 위한 통계**라는 게 이 모듈의 성격을 정한다:
//
// - **거리는 실제로 움직인 거리다.** 기록의 `dst_km`를 그대로 더한다 — 마일리지(종목 보정 +
//   이벤트 배율)를 쓰면 "추석 2배" 같은 배율이 거리처럼 부풀어 보인다. 마일리지는 목표 달성
//   얘기(올클리어·칼각왕)에만 쓴다. 칼로리도 배율 없는 기본 마일리지로 잡는다.
// - **순위를 매기지 않는다.** 시상식은 부문마다 1등(동점이면 공동)만 부르고, 명단(크레딧)은
//   이름순이다. 마일리지 순위표를 만들면 회고가 아니라 성적표가 된다.
// - **못한 것은 세지 않는다.** 미달성 달·기록 0건·월말 몰아치기처럼 누군가를 겨냥하게 되는
//   숫자는 만들지 않는다. 칼각왕(목표를 아슬아슬하게 넘긴 달)도 "해낸 달"만 본다.
// - **실제 프로젝트 기간만 센다**(시작일 ~ 종료일). 시작 전 연습월 기록은 빼고 센다 — 크루가
//   정했다("실제 프로젝트 기간만"). 연습월은 신청·적응 기간이라 시즌 성적에 넣으면 숫자가 부푼다.
//
// DB·네트워크를 모른다. 조회는 `lib/queries/mileage-recap.ts`가 하고 여기엔 행만 들어온다.

import { dayjs, formatKST } from "@/lib/dayjs";
import { calcBaseMileage, isMonthAchieved } from "@/lib/mileage";
import { SPORT_EMOJI, SPORT_LABELS, type SportCode } from "@/lib/sport";

/* ------------------------------------------------------------------ */
/*  입력                                                                */
/* ------------------------------------------------------------------ */

export type RecapPerson = {
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
};

export type RecapParticipant = RecapPerson & {
  prt_id: string;
  /**
   * 이름을 부르지 않을 사람 — 계정 탈퇴(`mem_mst.del_yn`) 또는 크루를 떠남
   * (`team_mem_rel.mem_st_cd = 'left'`). 합계엔 남기되 이름이 불리는 자리(시상·명단·추억)에선 뺀다.
   */
  del_yn: boolean;
};

export type RecapActRow = {
  act_id: string;
  prt_id: string;
  /** date 컬럼 'YYYY-MM-DD' */
  act_dt: string;
  sprt_enm: string;
  // numeric 컬럼 — 드라이버에 따라 문자열로 올 수 있고, 고도는 비어 있을 수 있다
  dst_km: number | string | null;
  elv_m: number | string | null;
  base_mlg: number | string | null;
  final_mlg: number | string | null;
  /** `[{ mult_nm, mult_val }]` — 적용된 이벤트 배율 스냅샷 */
  aply_mults: unknown;
  review: string | null;
  photo_url: string | null;
  /** timestamptz — 기록을 **입력한** 시각(달린 시각이 아니다) */
  created_at: string;
};

export type RecapSnapRow = {
  prt_id: string;
  /** 'YYYY-MM-01' */
  base_dt: string;
  goal_mlg: number;
  achv_mlg: number | string | null;
};

export type RecapInput = {
  event: { evt_id: string; evt_nm: string; stt_dt: string; end_dt: string };
  participants: RecapParticipant[];
  acts: RecapActRow[];
  snaps: RecapSnapRow[];
  /**
   * 몰아 올린 기록(`RECAP_SEASON_EXTRAS.bulkActIds`) — 합계엔 넣고 "한 번에 뛴 거리" 판정
   * (장거리왕·가장 멀리 간 날)에서만 뺀다. 조회 쪽이 시즌 설정에서 꺼내 넘긴다.
   */
  bulkActIds: string[];
};

/* ------------------------------------------------------------------ */
/*  출력                                                                */
/* ------------------------------------------------------------------ */

export type RecapStop = {
  key: string;
  city: string;
  /** 서울에서의 직선거리(대권거리) km — 반올림 */
  km: number;
  /** 크루 누적 거리가 이 거리를 처음 넘긴 날. 못 넘겼으면 null */
  reachedOn: string | null;
};

export type RecapEquivalent = {
  key: string;
  emoji: string;
  /** "에베레스트" — 뒤에 배수 + `suffix`가 붙는다("에베레스트 22번") */
  unit: string;
  times: number;
  /** "번" · "마리" */
  suffix: string;
  /** 근거 한 줄 — "다 같이 오른 높이 195,680m" */
  basis: string;
};

export type RecapDay = {
  date: string;
  acts: number;
  /** 0~4 — 히트맵 농도(시즌 최다일 대비) */
  level: 0 | 1 | 2 | 3 | 4;
};

export type RecapMonth = {
  /** 'YYYY-MM-01' */
  base_dt: string;
  label: string;
  km: number;
  acts: number;
  days: RecapDay[];
};

export type RecapWinner = {
  person: RecapPerson;
  /** 이름 아래 작은 한 줄(공동 수상자마다 다를 때 — 올클리어의 "5/5달" 등) */
  sub: string | null;
};

export type RecapAward = {
  key: string;
  emoji: string;
  title: string;
  /** 크게 세우는 값 — "36,286m" */
  value: string;
  /** 한 줄 설명 — "혼자서 에베레스트 4.1번 오른 셈이에요" */
  caption: string;
  winners: RecapWinner[];
};

/**
 * 추억 한 장 — 사진과 한마디를 하나로 묶는다. 사진만 있거나, 한마디만 있거나, 둘 다 있다.
 * 같은 기록에서 나온 사진과 한마디는 한 장이다(따로 흩어 보이면 맥락이 끊긴다).
 */
export type RecapMemory = {
  person: RecapPerson;
  act_dt: string;
  sport: SportCode | null;
  km: number;
  photo_url: string | null;
  text: string | null;
};

export type RecapMemberMonth = {
  base_dt: string;
  goal: number;
  achv: number;
  achieved: boolean;
};

/** 한 사람의 시즌 — "나의 시즌" 카드가 읽는다 */
export type RecapMember = {
  person: RecapPerson;
  acts: number;
  days: number;
  /** 실제로 움직인 거리 */
  km: number;
  elv: number;
  photos: number;
  reviews: number;
  longestStreak: number;
  sports: { sport: SportCode; km: number; acts: number }[];
  /** 한 번에 가장 멀리 간 날(실제 거리) */
  bestDay: {
    act_dt: string;
    sport: SportCode | null;
    km: number;
    elv: number;
  } | null;
  months: RecapMemberMonth[];
  /** 크루 전체 거리 중 내 몫 (0~1) */
  crewShare: number;
  /** 내 거리로 서울에서 갈 수 있었던 가장 먼 도시 */
  farthest: { city: string; km: number } | null;
  /** 받은 상 key 목록 */
  awardKeys: string[];
};

/**
 * 기념비 순간 — 크루 누적이 어떤 고비를 넘긴 바로 그 기록. "1만 km는 OO의 10km가 넘겼다"처럼
 * 숫자가 사람 이름으로 남게 한다.
 */
export type RecapMilestone = {
  key: string;
  kind: "count" | "km";
  /** "시즌 첫 기록" · "1,000번째 기록" · "10,000km 돌파" */
  label: string;
  date: string;
  /** 그 기록을 남긴 사람 — 이름을 부르지 않을 사람이면 null */
  person: RecapPerson | null;
  sport: SportCode | null;
  /** 그 기록 하나의 거리 */
  km: number;
};

export type RecapMultiplier = {
  name: string;
  val: number;
  uses: number;
  people: number;
  /** 제일 많이 탄 사람(동점이면 공동, 최대 3명) */
  top: { person: RecapPerson; uses: number }[];
};

export type MileageRecap = {
  event: {
    evt_id: string;
    evt_nm: string;
    stt_dt: string;
    end_dt: string;
    /** 집계 시작일 — 시즌 시작 달 1일(연습월은 뺀다) */
    from: string;
    /** from ~ end_dt 일수(양끝 포함) */
    days: number;
  };
  totals: {
    /** 실제로 움직인 거리 — 보정·배율 없음 */
    km: number;
    elv: number;
    acts: number;
    photos: number;
    reviews: number;
    /** 승인된 참가자 */
    participants: number;
    /** 기록을 1건 이상 남긴 사람 */
    runners: number;
    /** 누군가 한 명이라도 기록을 남긴 날 수 */
    activeDays: number;
    /** 크루가 하루도 안 쉬고 이어 간 최장 연속 일수 */
    teamStreak: number;
  };
  sports: {
    sport: SportCode;
    label: string;
    emoji: string;
    km: number;
    acts: number;
    people: number;
  }[];
  journey: { km: number; antipodeKm: number; stops: RecapStop[] };
  equivalents: RecapEquivalent[];
  months: RecapMonth[];
  busiestDay: { date: string; acts: number; km: number; people: number } | null;
  /** 월요일 시작 7칸 */
  weekdays: { label: string; km: number; acts: number }[];
  /** 기록 입력 시각(KST) 0~23시 건수 */
  hours: number[];
  peakHour: number | null;
  multipliers: RecapMultiplier[];
  /** 기념비 순간 — 시간순 */
  milestones: RecapMilestone[];
  awards: RecapAward[];
  /** 추억 넘기기 — 사진 있는 건 전부 + 한마디만 있는 건 고르게 솎아 `RECAP_MEMORY_CAP`까지 */
  memories: RecapMemory[];
  /** 사람별 추억 위치(`memories` 인덱스) — 시상식·나의 시즌이 그 사람 추억을 하나 골라 보인다 */
  memoryIdxByMember: Record<string, number[]>;
  /** 시즌 마지막 날(기록이 있던 마지막 날) — 엔딩 */
  lastDay: { date: string; people: number; memories: RecapMemory[] } | null;
  /** 크레딧 — 달린 사람 전원 이름순 */
  credits: RecapPerson[];
  members: Record<string, RecapMember>;
};

/* ------------------------------------------------------------------ */
/*  상수                                                                */
/* ------------------------------------------------------------------ */

/**
 * 화면에 쓰는 이모지 — JSX 본문에 직접 치면 Tailwind v4 스캐너가 서로게이트 쌍을 깨뜨려
 * 빌드가 터진다(§DESIGN.md 스크린 존 — `RCTN_LABEL`과 같은 이유). 문자열 상수로 들고 다닌다.
 */
export const RECAP_EMOJI = {
  fire: "🔥",
  finish: "🏁",
  runner: "🏃",
  party: "🎉",
  camera: "📷",
  clap: "👏",
  cheers: "🍻",
} as const;

/** 시즌 종료 후 기강이야기 리드 첫 칸에 "완주" 소식을 세우는 기간(일) */
export const RECAP_LEDE_DAYS = 30;

/**
 * 추억 넘기기에 싣는 최대 장 수 — 사진은 전부 싣고 남는 자리를 한마디로 채운다.
 * 전부 실으면 페이지 payload가 수백 KB로 붓는다.
 */
export const RECAP_MEMORY_CAP = 450;
/** 한마디만 있는 추억의 최소 길이 — "굿", "ㅎㅎ"만 뜨면 넘기는 맛이 없다(사진이 있으면 짧아도 싣는다) */
const MEMORY_TEXT_MIN = 6;

/**
 * 같이 뛰었다고 볼 배율 — 이름에 이 말이 들어 있으면 "모임에서 뛴 기록"으로 친다(짝꿍 계산).
 * 배율 이름은 운영진이 시즌마다 짓는 거라 정확한 이름이 아니라 낱말로 잡는다.
 */
const GROUP_MULT_PATTERN = /모임|정기런|벙|LSD/;

const EARTH_R_KM = 6371;
const SEOUL = { lat: 37.5665, lon: 126.978 };

/** 서울의 정반대편까지 = 지구 둘레의 절반 */
export const ANTIPODE_KM = Math.round(Math.PI * EARTH_R_KM);

/**
 * 도시 도장 — 크루 누적 거리로 서울에서 "여기까지 왔다"를 찍는 도시들.
 * 거리는 좌표로 계산한다(직선=대권거리). 손으로 적어 두면 출처마다 수십 km씩 달라 틀린 숫자가
 * 굳는다. 도시를 바꾸려면 여기 한 줄만 고치면 된다(순서는 거리로 다시 정렬된다).
 */
const DESTINATIONS: { key: string; city: string; lat: number; lon: number }[] = [
  { key: "busan", city: "부산", lat: 35.1796, lon: 129.0756 },
  { key: "tokyo", city: "도쿄", lat: 35.6762, lon: 139.6503 },
  { key: "hongkong", city: "홍콩", lat: 22.3193, lon: 114.1694 },
  { key: "bangkok", city: "방콕", lat: 13.7563, lon: 100.5018 },
  { key: "singapore", city: "싱가포르", lat: 1.3521, lon: 103.8198 },
  { key: "honolulu", city: "호놀룰루", lat: 21.3069, lon: -157.8583 },
  { key: "paris", city: "파리", lat: 48.8566, lon: 2.3522 },
  { key: "la", city: "LA", lat: 34.0522, lon: -118.2437 },
  { key: "newyork", city: "뉴욕", lat: 40.7128, lon: -74.006 },
  { key: "rio", city: "리우", lat: -22.9068, lon: -43.1729 },
  // 도장(지름 100px) 안에서 두 줄로 접히도록 가운데에 폭 없는 공백(U+200B)을 둔다
  { key: "buenosaires", city: "부에노스​아이레스", lat: -34.6037, lon: -58.3816 },
];

/** 대권거리(하버사인) km */
function greatCircleKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 도장 후보(도착일 없이) — 거리순. 마지막은 늘 "지구 반대편" */
export const RECAP_STOPS: { key: string; city: string; km: number }[] = [
  ...DESTINATIONS.map((d) => ({
    key: d.key,
    city: d.city,
    km: Math.round(greatCircleKm(SEOUL, d)),
  })).sort((a, b) => a.km - b.km),
  { key: "antipode", city: "지구 반대편", km: ANTIPODE_KM },
];

/** 비교 기준값 */
const EVEREST_M = 8849;
const MARATHON_KM = 42.195;
/** 국토종주 자전거길(인천 아라서해갑문 ~ 부산 낙동강하굿둑) */
const CYCLE_ROUTE_KM = 633;
/** 부산 ~ 쓰시마(대마도) 약 50km */
const STRAIT_KM = 50;
/**
 * 기본 마일리지 1당 소모 열량(kcal) — **대충**이다. 달리기는 체중(kg)×거리(km)가 대략의 kcal라
 * 65kg 러너 기준 65. 기본 마일리지(`calcBaseMileage` — 자전거 ÷4·수영 ×3·고도 +)가 이미 종목별
 * 강도를 맞춰 둔 단위라 거기에 곱한다. **배율은 빼고** — 추석 2배라고 칼로리가 두 배 타진 않는다.
 * 화면에도 "대충 계산"이라고 적는다.
 */
const KCAL_PER_MLG = 65;
/** 후라이드 치킨 한 마리 ≈ 2,000kcal */
const CHICKEN_KCAL = 2000;

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/** 기념비 — 몇 번째 기록 / 몇 km 돌파. 시즌에 닿은 것만 싣는다 */
const COUNT_MILESTONES = [1, 500, 1000, 1500, 2000, 3000, 5000];
const KM_MILESTONES = [1000, 5000, 10000, 15000, 20000, 30000];

/* ------------------------------------------------------------------ */
/*  표시 헬퍼 — 서버·클라이언트 공용                                        */
/* ------------------------------------------------------------------ */

/** 천 단위 쉼표. `digits`는 최대 소수 자릿수(0이면 반올림 정수) */
export function formatRecapNumber(n: number, digits = 0): string {
  return n.toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

/** 거리 — 100km 미만은 소수 한 자리, 그 이상은 정수 */
export function formatRecapKm(km: number): string {
  return `${formatRecapNumber(km, km < 100 ? 1 : 0)}km`;
}

/** 배수 — 10 미만은 소수 한 자리(2.9), 그 이상은 정수(22). 기본 단위는 "번" */
export function formatTimes(times: number, suffix = "번"): string {
  return `${formatRecapNumber(times, times < 10 ? 1 : 0)}${suffix}`;
}

/** 0~23시 → "밤 10시" 같은 말 */
export function formatHourLabel(h: number): string {
  if (h === 0) return "자정";
  if (h < 5) return `새벽 ${h}시`;
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "낮 12시";
  if (h < 18) return `오후 ${h - 12}시`;
  if (h < 21) return `저녁 ${h - 12}시`;
  return `밤 ${h - 12}시`;
}

/** 시즌 최다일 대비 농도 0~4 */
export function heatLevel(acts: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (acts <= 0 || max <= 0) return 0;
  const r = acts / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

/**
 * 리드 슬롯을 세울 기간인가 — 종료 다음 날부터 `RECAP_LEDE_DAYS`일.
 * 둘 다 'YYYY-MM-DD'(KST 날짜)라 문자열 비교·날짜 차이가 그대로 맞는다.
 */
export function isRecapLedeWindow(endDt: string, today: string): boolean {
  if (today <= endDt) return false;
  return dayjs(today).diff(dayjs(endDt), "day") <= RECAP_LEDE_DAYS;
}

/* ------------------------------------------------------------------ */
/*  계산                                                                */
/* ------------------------------------------------------------------ */

const num = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const asSport = (s: string): SportCode | null =>
  Object.hasOwn(SPORT_LABELS, s) ? (s as SportCode) : null;

/**
 * 한마디를 추억에 실을 수 있는 말로 다듬는다.
 *
 * 워치 앱에서 운동 요약을 통째로 붙여 넣은 후기("야외 달리기 | 08:47–09:16 | 운동 0:29:01 | …")는
 * 사람이 쓴 말이 아니라 추억으로 넘기면 계기판 출력이 뜬다 — 구분자(`|`)가 셋 이상이면 뺀다.
 */
function memoryText(review: string | null, hasPhoto: boolean): string | null {
  const s = review?.trim();
  if (!s) return null;
  if ((s.match(/\|/g) ?? []).length >= 3) return null;
  if (!hasPhoto && s.length < MEMORY_TEXT_MIN) return null;
  return s;
}

/**
 * 날짜 인덱스(집계 시작일로부터 며칠째) 목록 → 최장 연속 구간.
 * 같은 날 여러 건은 하루로 친다. 길이가 같은 구간이 여럿이면 먼저 온 것.
 */
function longestStreak(dayIdx: number[]): { len: number; start: number; end: number } {
  const sorted = [...new Set(dayIdx)].sort((a, b) => a - b);
  if (sorted.length === 0) return { len: 0, start: 0, end: 0 };
  let best = { len: 1, start: sorted[0], end: sorted[0] };
  let runStart = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) runStart = sorted[i];
    const len = sorted[i] - runStart + 1;
    if (len > best.len) best = { len, start: runStart, end: sorted[i] };
  }
  return best;
}

/** `aply_mults` jsonb → 배율 목록. 모양이 어긋난 행은 조용히 건너뛴다(옛 데이터) */
function parseMults(v: unknown): { name: string; val: number }[] {
  if (!Array.isArray(v)) return [];
  const out: { name: string; val: number }[] = [];
  for (const m of v) {
    if (m && typeof m === "object" && "mult_nm" in m) {
      const name = String((m as { mult_nm: unknown }).mult_nm ?? "").trim();
      if (name) out.push({ name, val: num((m as { mult_val?: number }).mult_val) });
    }
  }
  return out;
}

const byName = (a: RecapPerson, b: RecapPerson) =>
  a.mem_nm.localeCompare(b.mem_nm, "ko");

type Agg = {
  prt_id: string;
  person: RecapPerson;
  deleted: boolean;
  acts: number;
  dayIdx: number[];
  /** 날짜별 기록 수 — 두탕왕 */
  perDay: Map<string, number>;
  km: number;
  elv: number;
  photos: number;
  reviews: number;
  owl: number;
  bird: number;
  sports: Map<SportCode, { km: number; acts: number }>;
  bestDay: RecapMember["bestDay"];
  longestRun: { km: number; act_dt: string } | null;
  mults: Map<string, number>;
};

/**
 * 부문 1등 — 동점이면 공동 수상(이름순). `min` 미만이면 아무도 안 받는다
 * (올빼미 1번처럼 "1등이긴 한데 그게 상인가" 싶은 걸 거른다).
 */
function topBy(
  aggs: Agg[],
  value: (a: Agg) => number,
  min: number,
): { value: number; aggs: Agg[] } | null {
  // 거리·고도는 부동소수 합이라 같은 값도 끝자리가 갈린다 — 소수 둘째 자리로 맞춰 동점을 판정한다
  const v = (a: Agg) => Math.round(value(a) * 100) / 100;
  let best = -Infinity;
  for (const a of aggs) best = Math.max(best, v(a));
  if (!Number.isFinite(best) || best < min) return null;
  const tied = aggs
    .filter((a) => v(a) === best)
    .sort((x, y) => byName(x.person, y.person));
  return { value: best, aggs: tied };
}

const winnersOf = (aggs: Agg[], sub: (a: Agg) => string | null = () => null) =>
  aggs.map((a) => ({ person: a.person, sub: sub(a) }));

/** 활동 날짜 표기 — "4.11" */
const md = (date: string) => dayjs(date).format("M.D");

export function buildMileageRecap(input: RecapInput): MileageRecap {
  const { event, participants } = input;
  // 시작일이 1일이 아니어도 달 단위로 맞춘다 — 달력·목표 달 판정이 전부 달 시작일을 기준으로 한다.
  // 집계는 시즌 시작 달부터 — 연습월(시작 전 달)은 넣지 않는다(실제 프로젝트 기간만).
  const seasonStart = dayjs(event.stt_dt).format("YYYY-MM-01");
  const from = seasonStart;
  const fromDay = dayjs(from);
  const totalDays = dayjs(event.end_dt).diff(fromDay, "day") + 1;
  const toIdx = (date: string) => dayjs(date).diff(fromDay, "day");

  const prtMap = new Map(participants.map((p) => [p.prt_id, p]));
  const bulk = new Set(input.bulkActIds);
  const aggMap = new Map<string, Agg>();
  for (const p of participants) {
    aggMap.set(p.prt_id, {
      prt_id: p.prt_id,
      person: { mem_id: p.mem_id, mem_nm: p.mem_nm, avatar_url: p.avatar_url },
      deleted: p.del_yn,
      acts: 0,
      dayIdx: [],
      perDay: new Map(),
      km: 0,
      elv: 0,
      photos: 0,
      reviews: 0,
      owl: 0,
      bird: 0,
      sports: new Map(),
      bestDay: null,
      longestRun: null,
      mults: new Map(),
    });
  }

  // 집계 창 밖(시즌 시작 전 연습월·종료 이후) 행은 뺀다 — 달력·합계·도장·시상이 같은 창을 보게.
  const acts = input.acts
    .filter(
      (a) => prtMap.has(a.prt_id) && a.act_dt >= from && a.act_dt <= event.end_dt,
    )
    .sort((a, b) =>
      a.act_dt === b.act_dt
        ? a.created_at.localeCompare(b.created_at)
        : a.act_dt.localeCompare(b.act_dt),
    );

  const totals = {
    km: 0,
    elv: 0,
    acts: acts.length,
    photos: 0,
    reviews: 0,
    participants: participants.length,
    runners: 0,
    activeDays: 0,
    teamStreak: 0,
  };
  let baseMlg = 0;
  const sportTotals = new Map<
    SportCode,
    { km: number; acts: number; people: Set<string> }
  >();
  const dayMap = new Map<string, { acts: number; km: number; people: Set<string> }>();
  const weekdays = WEEKDAY_LABELS.map((label) => ({ label, km: 0, acts: 0 }));
  const hours = Array.from({ length: 24 }, () => 0);
  const multMap = new Map<string, { val: number; uses: number; people: Set<string> }>();
  /** 날짜별 모임 배율 기록자(prt_id) — 짝꿍 */
  const groupDays = new Map<string, Set<string>>();
  const milestones: RecapMilestone[] = [];
  let actNo = 0;
  let cumKm = 0;
  let nextKm = 0;
  const photoMemories: RecapMemory[] = [];
  const textMemories: RecapMemory[] = [];
  const memoriesByDate = new Map<string, RecapMemory[]>();

  for (const a of acts) {
    const agg = aggMap.get(a.prt_id)!;
    const km = num(a.dst_km);
    const elv = num(a.elv_m);
    const sport = asSport(a.sprt_enm);
    const idx = toIdx(a.act_dt);
    const review = a.review?.trim() || null;

    totals.km += km;
    totals.elv += elv;

    // 기념비 — 이 기록이 몇 번째인지·누적 거리 고비를 넘겼는지(행은 날짜·입력 순으로 정렬돼 있다)
    const named = agg.deleted ? null : agg.person;
    actNo += 1;
    const n = actNo;
    if (COUNT_MILESTONES.includes(n)) {
      milestones.push({
        key: `count-${n}`,
        kind: "count",
        label: n === 1 ? "시즌 첫 기록" : `${formatRecapNumber(n)}번째 기록`,
        date: a.act_dt,
        person: named,
        sport,
        km,
      });
    }
    cumKm += km;
    while (nextKm < KM_MILESTONES.length && cumKm >= KM_MILESTONES[nextKm]) {
      const t = KM_MILESTONES[nextKm];
      milestones.push({
        key: `km-${t}`,
        kind: "km",
        label: `${formatRecapNumber(t)}km 돌파`,
        date: a.act_dt,
        person: named,
        sport,
        km,
      });
      nextKm += 1;
    }

    baseMlg += calcBaseMileage(sport ?? "RUNNING", km, sport === "SWIMMING" ? 0 : elv);

    agg.acts += 1;
    agg.dayIdx.push(idx);
    agg.perDay.set(a.act_dt, (agg.perDay.get(a.act_dt) ?? 0) + 1);
    agg.km += km;
    agg.elv += elv;
    // "한 번에 뛴 거리" 판정 — 몰아 올린 기록은 여기서만 뺀다(합계엔 위에서 이미 들어갔다)
    const single = !bulk.has(a.act_id);
    if (single && (!agg.bestDay || km > agg.bestDay.km)) {
      agg.bestDay = { act_dt: a.act_dt, sport, km, elv };
    }
    if (
      single &&
      (sport === "RUNNING" || sport === "TRAIL") &&
      (!agg.longestRun || km > agg.longestRun.km)
    ) {
      agg.longestRun = { km, act_dt: a.act_dt };
    }

    if (sport) {
      const s = agg.sports.get(sport) ?? { km: 0, acts: 0 };
      s.km += km;
      s.acts += 1;
      agg.sports.set(sport, s);

      const t = sportTotals.get(sport) ?? { km: 0, acts: 0, people: new Set() };
      t.km += km;
      t.acts += 1;
      t.people.add(agg.person.mem_id);
      sportTotals.set(sport, t);
    }

    const d = dayMap.get(a.act_dt) ?? { acts: 0, km: 0, people: new Set() };
    d.acts += 1;
    d.km += km;
    d.people.add(agg.person.mem_id);
    dayMap.set(a.act_dt, d);

    const wd = weekdays[(dayjs(a.act_dt).day() + 6) % 7];
    wd.km += km;
    wd.acts += 1;

    // 입력 시각은 timestamptz라 KST로 찍어 읽는다(서버는 UTC — §AGENTS 날짜 규칙)
    const hour = Number(formatKST(a.created_at, "H"));
    if (Number.isInteger(hour) && hour >= 0 && hour < 24) {
      hours[hour] += 1;
      if (hour <= 3) agg.owl += 1;
      else if (hour <= 7) agg.bird += 1;
    }

    let grouped = false;
    for (const m of parseMults(a.aply_mults)) {
      const e = multMap.get(m.name) ?? { val: m.val, uses: 0, people: new Set() };
      e.uses += 1;
      e.people.add(agg.person.mem_id);
      multMap.set(m.name, e);
      agg.mults.set(m.name, (agg.mults.get(m.name) ?? 0) + 1);
      if (GROUP_MULT_PATTERN.test(m.name)) grouped = true;
    }
    if (grouped && !agg.deleted) {
      const set = groupDays.get(a.act_dt) ?? new Set<string>();
      set.add(a.prt_id);
      groupDays.set(a.act_dt, set);
    }

    if (a.photo_url) {
      totals.photos += 1;
      agg.photos += 1;
    }
    if (review) {
      totals.reviews += 1;
      agg.reviews += 1;
    }
    if (!agg.deleted) {
      const text = memoryText(review, !!a.photo_url);
      if (a.photo_url || text) {
        const memory: RecapMemory = {
          person: agg.person,
          act_dt: a.act_dt,
          sport,
          km,
          photo_url: a.photo_url,
          text,
        };
        (a.photo_url ? photoMemories : textMemories).push(memory);
        const list = memoriesByDate.get(a.act_dt) ?? [];
        list.push(memory);
        memoriesByDate.set(a.act_dt, list);
      }
    }
  }

  const aggs = [...aggMap.values()];
  totals.runners = aggs.filter((a) => a.acts > 0).length;
  totals.activeDays = dayMap.size;
  totals.teamStreak = longestStreak([...dayMap.keys()].map(toIdx)).len;

  /* 도시 도장 — 누적 거리가 도시 거리를 처음 넘긴 날 */
  const stops: RecapStop[] = RECAP_STOPS.map((s) => ({ ...s, reachedOn: null }));
  const sortedDays = [...dayMap.keys()].sort();
  {
    let cum = 0;
    let next = 0;
    for (const date of sortedDays) {
      cum += dayMap.get(date)!.km;
      while (next < stops.length && cum >= stops[next].km) {
        stops[next].reachedOn = date;
        next += 1;
      }
    }
  }

  /* 달력 — 시즌 시작 달부터 종료월까지 달마다 한 줄 */
  const maxDayActs = Math.max(0, ...[...dayMap.values()].map((d) => d.acts));
  const months: RecapMonth[] = [];
  for (
    let m = dayjs(from);
    m.format("YYYY-MM-DD") <= event.end_dt;
    m = m.add(1, "month")
  ) {
    const base_dt = m.format("YYYY-MM-01");
    const days: RecapDay[] = [];
    let km = 0;
    let mActs = 0;
    for (let i = 0; i < m.daysInMonth(); i++) {
      const date = m.add(i, "day").format("YYYY-MM-DD");
      if (date > event.end_dt) break;
      const d = dayMap.get(date);
      const n = d?.acts ?? 0;
      km += d?.km ?? 0;
      mActs += n;
      days.push({ date, acts: n, level: heatLevel(n, maxDayActs) });
    }
    months.push({
      base_dt,
      label: m.format("M월"),
      km,
      acts: mActs,
      days,
    });
  }

  let busiestDay: MileageRecap["busiestDay"] = null;
  for (const [date, d] of dayMap) {
    if (
      !busiestDay ||
      d.acts > busiestDay.acts ||
      (d.acts === busiestDay.acts && d.km > busiestDay.km)
    ) {
      busiestDay = { date, acts: d.acts, km: d.km, people: d.people.size };
    }
  }

  const peak = Math.max(...hours);
  const peakHour = peak > 0 ? hours.indexOf(peak) : null;

  /* 다른 걸로 바꿔 보기 — 0에 가까우면 싣지 않는다(수영한 사람이 없는 시즌에 "0번"은 농담이 안 된다) */
  const sportKm = (s: SportCode) => sportTotals.get(s)?.km ?? 0;
  const footKm = sportKm("RUNNING") + sportKm("TRAIL");
  const kcal = baseMlg * KCAL_PER_MLG;
  const equivalents: RecapEquivalent[] = [
    {
      key: "marathon",
      emoji: "🏅",
      unit: "풀코스 마라톤",
      times: footKm / MARATHON_KM,
      suffix: "번",
      basis: `러닝·트레일로 뛴 거리 ${formatRecapKm(footKm)}`,
    },
    {
      key: "everest",
      emoji: "🏔️",
      unit: "에베레스트",
      times: totals.elv / EVEREST_M,
      suffix: "번",
      basis: `다 같이 오른 높이 ${formatRecapNumber(totals.elv)}m`,
    },
    {
      key: "cycle",
      emoji: "🚴",
      unit: "국토종주 자전거길",
      times: sportKm("CYCLING") / CYCLE_ROUTE_KM,
      suffix: "번",
      basis: `자전거 ${formatRecapKm(sportKm("CYCLING"))} (종주길 633km)`,
    },
    {
      key: "strait",
      emoji: "🏊",
      unit: "부산→대마도 수영",
      times: sportKm("SWIMMING") / STRAIT_KM,
      suffix: "번",
      basis: `수영 ${formatRecapKm(sportKm("SWIMMING"))} (약 50km)`,
    },
    {
      key: "chicken",
      emoji: "🍗",
      unit: "치킨",
      times: kcal / CHICKEN_KCAL,
      suffix: "마리",
      basis: `약 ${formatRecapNumber(kcal / 10000, 0)}만 kcal 태웠어요 (대충 계산)`,
    },
  ].filter((e) => e.times >= 0.1);

  /* 종목 */
  const sports = [...sportTotals.entries()]
    .map(([sport, t]) => ({
      sport,
      label: SPORT_LABELS[sport],
      emoji: SPORT_EMOJI[sport],
      km: t.km,
      acts: t.acts,
      people: t.people.size,
    }))
    .sort((a, b) => b.acts - a.acts);

  /* 배율 — 이벤트마다 제일 많이 탄 사람까지 */
  const named = aggs.filter((a) => !a.deleted);
  const multipliers: RecapMultiplier[] = [...multMap.entries()]
    .map(([name, e]) => {
      const best = Math.max(0, ...named.map((a) => a.mults.get(name) ?? 0));
      const top =
        best > 0
          ? named
              .filter((a) => a.mults.get(name) === best)
              .sort((x, y) => byName(x.person, y.person))
              .slice(0, 3)
              .map((a) => ({ person: a.person, uses: best }))
          : [];
      return { name, val: e.val, uses: e.uses, people: e.people.size, top };
    })
    .sort((a, b) => b.uses - a.uses);

  /* 목표 달성 — 시즌 달만(연습월 스냅이 있어도 보지 않는다) */
  const monthsByPrt = new Map<string, RecapMemberMonth[]>();
  for (const s of input.snaps) {
    if (s.base_dt < seasonStart || s.base_dt > event.end_dt) continue;
    if (!prtMap.has(s.prt_id)) continue;
    const achv = num(s.achv_mlg);
    const list = monthsByPrt.get(s.prt_id) ?? [];
    list.push({
      base_dt: s.base_dt,
      goal: s.goal_mlg,
      achv,
      achieved: isMonthAchieved(achv, s.goal_mlg),
    });
    monthsByPrt.set(s.prt_id, list);
  }
  for (const list of monthsByPrt.values()) {
    list.sort((a, b) => a.base_dt.localeCompare(b.base_dt));
  }

  /* 시상식 — 이름이 불리는 자리라 탈퇴자는 뺀다 */
  const eligible = aggs.filter((a) => !a.deleted && a.acts > 0);
  const awards: RecapAward[] = [];

  const pushTop = (
    key: string,
    emoji: string,
    title: string,
    value: (a: Agg) => number,
    min: number,
    fmt: (v: number) => { value: string; caption: string },
    sub?: (a: Agg) => string | null,
  ) => {
    const top = topBy(eligible, value, min);
    if (!top) return;
    const { value: v, caption } = fmt(top.value);
    awards.push({ key, emoji, title, value: v, caption, winners: winnersOf(top.aggs, sub) });
  };

  // 올클리어 — 참가한 정식 시즌 달을 전부 달성
  {
    const perfect = named
      .map((a) => ({ a, months: monthsByPrt.get(a.prt_id) ?? [] }))
      .filter((x) => x.months.length > 0 && x.months.every((m) => m.achieved))
      .sort(
        (x, y) =>
          y.months.length - x.months.length || byName(x.a.person, y.a.person),
      );
    if (perfect.length > 0) {
      awards.push({
        key: "allclear",
        emoji: "🏆",
        title: "올클리어",
        value: `${perfect.length}명`,
        caption: "참가한 달마다 목표를 다 채웠어요",
        winners: perfect.map((x) => ({
          person: x.a.person,
          sub: `${x.months.length}/${x.months.length}달`,
        })),
      });
    }
  }

  pushTop("attendance", "📅", "출석왕", (a) => new Set(a.dayIdx).size, 10, (v) => ({
    value: `${v}일`,
    caption: `${totalDays}일 중 ${v}일 운동했어요`,
  }));

  pushTop(
    "streak",
    "🔗",
    "연속 출석왕",
    (a) => longestStreak(a.dayIdx).len,
    5,
    (v) => ({ value: `${v}일`, caption: `하루도 안 쉬고 ${v}일 연속으로 기록했어요` }),
    (a) => {
      const { start, end } = longestStreak(a.dayIdx);
      const at = (i: number) => md(fromDay.add(i, "day").format("YYYY-MM-DD"));
      return `${at(start)} ~ ${at(end)}`;
    },
  );

  pushTop("diligent", "📝", "기록왕", (a) => a.acts, 10, (v) => ({
    value: `${formatRecapNumber(v)}개`,
    caption: "기록을 제일 많이 남겼어요",
  }));

  pushTop(
    "double",
    "✌️",
    "두탕왕",
    (a) => [...a.perDay.values()].filter((n) => n >= 2).length,
    5,
    (v) => ({ value: `${v}일`, caption: "하루에 두 번 이상 운동한 날이 제일 많아요" }),
  );

  // 환상의 짝꿍 — 같은 날 둘 다 모임 배율이 붙은 날이 가장 많은 두 사람
  {
    const pairs = new Map<string, number>();
    for (const set of groupDays.values()) {
      const ids = [...set].sort();
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const k = `${ids[i]}|${ids[j]}`;
          pairs.set(k, (pairs.get(k) ?? 0) + 1);
        }
      }
    }
    let best: { a: Agg; b: Agg; n: number } | null = null;
    for (const [k, n] of pairs) {
      const [x, y] = k.split("|").map((id) => aggMap.get(id)!);
      const [a, b] = byName(x.person, y.person) <= 0 ? [x, y] : [y, x];
      const key = `${a.person.mem_nm}${b.person.mem_nm}`;
      if (
        !best ||
        n > best.n ||
        (n === best.n && key.localeCompare(`${best.a.person.mem_nm}${best.b.person.mem_nm}`, "ko") < 0)
      ) {
        best = { a, b, n };
      }
    }
    if (best && best.n >= 5) {
      awards.push({
        key: "buddy",
        emoji: "🤝",
        title: "환상의 짝꿍",
        value: `${best.n}일`,
        caption: "같은 날 모임 기록이 제일 많이 겹친 두 사람이에요",
        winners: [
          { person: best.a.person, sub: null },
          { person: best.b.person, sub: null },
        ],
      });
    }
  }

  pushTop("mountain", "🏔️", "산신령", (a) => a.elv, 1000, (v) => ({
    value: `${formatRecapNumber(v)}m`,
    caption:
      v / EVEREST_M >= 0.1
        ? `혼자서 에베레스트 ${formatTimes(v / EVEREST_M)} 오른 셈이에요`
        : "산을 제일 많이 탔어요",
  }));

  pushTop(
    "longest",
    "🛣️",
    "장거리왕",
    (a) => a.longestRun?.km ?? 0,
    21,
    (v) => ({ value: formatRecapKm(v), caption: "한 번에 제일 멀리 뛰었어요" }),
    (a) => (a.longestRun ? md(a.longestRun.act_dt) : null),
  );

  pushTop(
    "cycle",
    "🚴",
    "자전거왕",
    (a) => a.sports.get("CYCLING")?.km ?? 0,
    50,
    (v) => ({
      value: formatRecapKm(v),
      caption:
        v / CYCLE_ROUTE_KM >= 0.1
          ? `국토종주 자전거길 ${formatTimes(v / CYCLE_ROUTE_KM)}만큼 탔어요`
          : "자전거를 제일 많이 탔어요",
    }),
  );

  pushTop(
    "swim",
    "🏊",
    "물개",
    (a) => a.sports.get("SWIMMING")?.km ?? 0,
    1,
    (v) => ({
      value: formatRecapKm(v),
      caption:
        v / STRAIT_KM >= 0.1
          ? `부산에서 대마도까지 ${formatTimes(v / STRAIT_KM)} 헤엄친 거리예요`
          : "수영을 제일 많이 했어요",
    }),
  );

  pushTop(
    "allround",
    "🧭",
    "올라운더",
    (a) => a.sports.size,
    3,
    (v) => ({
      value: `${v}종목`,
      caption: v >= 4 ? "러닝·트레일·자전거·수영 다 했어요" : `${v}가지 종목을 오갔어요`,
    }),
    (a) => [...a.sports.keys()].map((s) => SPORT_EMOJI[s]).join(""),
  );

  // 칼각왕 — 목표를 가장 아슬아슬하게 넘긴 달(반올림 달성 포함). 해낸 달만 본다.
  // 같은 차이로 넘긴 사람이 여럿이면 공동 수상(다른 부문과 같은 규칙).
  {
    const cands: { a: Agg; m: RecapMemberMonth; margin: number }[] = [];
    for (const a of named) {
      for (const m of monthsByPrt.get(a.prt_id) ?? []) {
        if (!m.achieved) continue;
        cands.push({ a, m, margin: Math.round((m.achv - m.goal) * 100) / 100 });
      }
    }
    const best = Math.min(...cands.map((c) => c.margin));
    const tied = cands
      .filter((c) => c.margin === best)
      .sort((x, y) => byName(x.a.person, y.a.person));
    if (tied.length > 0 && best < 1) {
      const { m } = tied[0];
      awards.push({
        key: "razor",
        emoji: "🎯",
        title: "칼각왕",
        value: `${formatRecapNumber(m.achv, 2)} / ${m.goal}`,
        // 이름과 함께 공개되는 문구라 "모자랐다"고 적지 않는다 — 해낸 달을 기리는 상이다
        caption:
          best === 0
            ? "목표를 소수점까지 딱 맞췄어요"
            : "소수점 차이로 목표 달성! 아슬아슬했어요",
        winners: tied.map((c) => ({
          person: c.a.person,
          sub: `${dayjs(c.m.base_dt).format("M월")} 목표`,
        })),
      });
    }
  }

  pushTop("photo", "📸", "사진왕", (a) => a.photos, 3, (v) => ({
    value: `${v}장`,
    caption: "사진을 제일 많이 남겼어요",
  }));

  pushTop("writer", "✍️", "후기왕", (a) => a.reviews, 5, (v) => ({
    value: `${v}개`,
    caption: "한마디를 제일 많이 남겼어요",
  }));

  pushTop("bird", "🌅", "새벽왕", (a) => a.bird, 3, (v) => ({
    value: `${v}번`,
    caption: "새벽 4~8시에 기록을 제일 많이 올렸어요",
  }));

  pushTop("owl", "🦉", "올빼미", (a) => a.owl, 3, (v) => ({
    value: `${v}번`,
    caption: "자정 넘어서 기록을 제일 많이 올렸어요",
  }));

  /* 추억 — 사진은 전부, 한마디만 있는 건 남는 자리만큼 고르게 솎는다(결정적 — 캐시·테스트가 흔들리지 않게) */
  const textRoom = Math.max(0, RECAP_MEMORY_CAP - photoMemories.length);
  const pickedText =
    textMemories.length <= textRoom
      ? textMemories
      : Array.from(
          { length: textRoom },
          (_, i) => textMemories[Math.floor((i * textMemories.length) / textRoom)],
        );
  const memories = [...photoMemories, ...pickedText].sort((x, y) =>
    x.act_dt.localeCompare(y.act_dt),
  );
  const memoryIdxByMember: Record<string, number[]> = {};
  memories.forEach((m, i) => {
    (memoryIdxByMember[m.person.mem_id] ??= []).push(i);
  });

  /* 마지막 날 — 기록이 있던 마지막 날의 사람·추억 */
  const lastDate = sortedDays.at(-1) ?? null;
  const lastDay = lastDate
    ? {
        date: lastDate,
        people: dayMap.get(lastDate)!.people.size,
        memories: memoriesByDate.get(lastDate) ?? [],
      }
    : null;

  // "함께 뛴" 명단이라 기록이 1건 이상인 사람만 싣는다 — 참가 승인만 하고 한 번도 안 뛴
  // 사람까지 부르면 문구가 거짓이 되고, 그 얼굴이 홈 리드 더미에도 선다.
  const credits = aggs
    .filter((a) => !a.deleted && a.acts > 0)
    .map((a) => a.person)
    .sort(byName);

  /* 사람별 시즌 */
  const members: Record<string, RecapMember> = {};
  for (const [prtId, a] of aggMap) {
    const farthest =
      [...RECAP_STOPS].reverse().find((s) => s.key !== "antipode" && s.km <= a.km) ??
      null;
    members[a.person.mem_id] = {
      person: a.person,
      acts: a.acts,
      days: new Set(a.dayIdx).size,
      km: a.km,
      elv: a.elv,
      photos: a.photos,
      reviews: a.reviews,
      longestStreak: longestStreak(a.dayIdx).len,
      sports: [...a.sports.entries()]
        .map(([sport, s]) => ({ sport, km: s.km, acts: s.acts }))
        .sort((x, y) => y.acts - x.acts),
      bestDay: a.bestDay,
      months: monthsByPrt.get(prtId) ?? [],
      crewShare: totals.km > 0 ? a.km / totals.km : 0,
      farthest: farthest ? { city: farthest.city, km: farthest.km } : null,
      awardKeys: awards
        .filter((w) => w.winners.some((x) => x.person.mem_id === a.person.mem_id))
        .map((w) => w.key),
    };
  }

  return {
    event: {
      evt_id: event.evt_id,
      evt_nm: event.evt_nm,
      stt_dt: event.stt_dt,
      end_dt: event.end_dt,
      from,
      days: totalDays,
    },
    totals,
    sports,
    journey: { km: totals.km, antipodeKm: ANTIPODE_KM, stops },
    equivalents,
    months,
    busiestDay,
    weekdays,
    hours,
    peakHour,
    multipliers,
    milestones,
    awards,
    memories,
    memoryIdxByMember,
    lastDay,
    credits,
    members,
  };
}

/* ------------------------------------------------------------------ */
/*  리드 슬롯 티저                                                       */
/* ------------------------------------------------------------------ */

export type RecapTeaser = {
  evt_nm: string;
  /** 실제로 움직인 거리 */
  km: number;
  /** 기록을 1건 이상 남긴 사람 — "N명이 함께 뛰었어요" */
  runners: number;
  days: number;
  acts: number;
  photos: number;
  /** 지구 반대편 대비 (0~1+) */
  antipodeRatio: number;
  /** 얼굴 더미 — 크레딧(달린 사람, 이름을 부를 수 있는 사람) 전원. 몇 명을 어디서부터 보일지는 호출자가 정한다 */
  faces: RecapPerson[];
};

export function toRecapTeaser(recap: MileageRecap): RecapTeaser {
  return {
    evt_nm: recap.event.evt_nm,
    km: recap.totals.km,
    runners: recap.totals.runners,
    days: recap.event.days,
    acts: recap.totals.acts,
    photos: recap.totals.photos,
    antipodeRatio: recap.journey.antipodeKm > 0 ? recap.totals.km / recap.journey.antipodeKm : 0,
    faces: recap.credits,
  };
}

/**
 * 얼굴 더미에서 `n`명을 `offset`부터 돌려 뽑는다 — 매번 이름순 앞사람만 서지 않게.
 * offset은 서버가 뽑아 넘긴다(렌더 중 랜덤 금지 — 하이드레이션).
 */
export function pickTeaserFaces(
  faces: RecapPerson[],
  offset: number,
  n: number,
): RecapPerson[] {
  if (faces.length === 0) return [];
  const at = ((offset % faces.length) + faces.length) % faces.length;
  return [...faces.slice(at), ...faces.slice(0, at)].slice(0, n);
}

/** 상 옆에 수상자 추억을 곁들이는 최대 수상자 수 — 넘으면(올클리어 9명 등) 얼굴만 */
export const RECAP_MEMORY_WINNER_MAX = 2;

/** 추억 넘기기가 미리 받아 두는 다음 장 수 — 자동 넘기기가 2초라 한 장만 받아 두면 느린 망에서 빈 칸이 뜬다 */
export const RECAP_MEMORY_PRELOAD = 3;

/**
 * 페이지가 들어올 때마다 새로 뽑는 것들 — 수상자별 한 장, 내 한 장, 추억 넘기기 첫 장·다음 장들.
 * 서버가 요청마다 뽑아 넘긴다(렌더 중 랜덤 금지 — 하이드레이션). 진짜 페이지와 미리보기가 같은
 * 규칙으로 뽑게 여기 한 곳에 둔다.
 */
export function pickRecapPageExtras(
  recap: Pick<MileageRecap, "awards" | "memories" | "memoryIdxByMember">,
  myMemId: string | null,
  rnd: () => number = Math.random,
): {
  winnerMemories: Record<string, RecapMemory | null>;
  myMemory: RecapMemory | null;
  memoryStart: number;
  /** 첫 장 다음에 올 장들(`RECAP_MEMORY_PRELOAD`개) — 클라이언트가 미리 받아 둔다 */
  memoryQueue: number[];
} {
  const seed = () => Math.floor(rnd() * 1_000_000);
  const winnerMemories: Record<string, RecapMemory | null> = {};
  for (const a of recap.awards) {
    if (a.winners.length > RECAP_MEMORY_WINNER_MAX) continue;
    for (const w of a.winners) {
      winnerMemories[`${a.key}:${w.person.mem_id}`] = pickMemberMemory(
        recap,
        w.person.mem_id,
        seed(),
      );
    }
  }
  const memoryStart = drawMemoryIndex(recap.memories, new Set(), rnd);
  const seen = new Set([memoryStart]);
  const memoryQueue: number[] = [];
  for (let i = 0; i < Math.min(RECAP_MEMORY_PRELOAD, recap.memories.length - 1); i++) {
    const next = drawMemoryIndex(recap.memories, seen, rnd);
    memoryQueue.push(next);
    seen.add(next);
  }
  return {
    winnerMemories,
    myMemory: myMemId ? pickMemberMemory(recap, myMemId, seed()) : null,
    memoryStart,
    memoryQueue,
  };
}

/**
 * 추억 넘기기의 다음 장을 뽑는다 — 아직 안 본 장 중에서, **사진 있는 장을 전부 먼저**(그 안에선 랜덤).
 * 사진을 다 본 뒤에야 한마디만 있는 장이 나온다 — 한마디만 있는 장이 훨씬 많아서 섞어 뽑으면
 * 앞쪽이 글자판으로 채워진다. 다 봤으면 처음부터 다시 아무거나. `rnd`는 테스트가 갈아 끼운다.
 */
export function drawMemoryIndex(
  memories: RecapMemory[],
  seen: ReadonlySet<number>,
  rnd: () => number = Math.random,
): number {
  if (memories.length === 0) return -1;
  const photos: number[] = [];
  const texts: number[] = [];
  memories.forEach((m, i) => {
    if (seen.has(i)) return;
    (m.photo_url ? photos : texts).push(i);
  });
  if (photos.length + texts.length === 0) {
    return Math.floor(rnd() * memories.length);
  }
  const pool = photos.length > 0 ? photos : texts;
  return pool[Math.floor(rnd() * pool.length)];
}

/**
 * 사람별 추억 중 하나를 고른다 — 시상식·나의 시즌이 "그 사람이 남긴 한 장"을 곁들일 때.
 * `seed`는 서버가 요청마다 뽑아 넘긴다(들어올 때마다 다른 장). 사진 있는 추억을 먼저 본다 —
 * 상 옆에 서는 한 장이라 사진이 있으면 그쪽이 훨씬 반갑다.
 */
export function pickMemberMemory(
  recap: Pick<MileageRecap, "memories" | "memoryIdxByMember">,
  memId: string,
  seed: number,
): RecapMemory | null {
  const idx = recap.memoryIdxByMember[memId];
  if (!idx || idx.length === 0) return null;
  const withPhoto = idx.filter((i) => recap.memories[i].photo_url);
  const pool = withPhoto.length > 0 ? withPhoto : idx;
  const at = ((Math.floor(seed) % pool.length) + pool.length) % pool.length;
  return recap.memories[pool[at]];
}
