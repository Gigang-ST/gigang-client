import { parseEventTime, secondsToTime, todayStartKST } from "@/lib/dayjs";
import { MOOD_SCALE, type MoodLevel } from "@/lib/mood-scale";
import {
  JOIN_PURP_LABELS,
  JOIN_PURP_SHORT_LABELS,
  PACE_LABELS,
  type AVG_PACE_CODES,
  type JOIN_PURP_CODES,
} from "@/lib/validations/member";

import type {
  MemberCardRaceRecord,
  MemberCardRecord,
} from "@/lib/queries/member-card";

/**
 * 활동 컨디션 — 최근 90일(3개월) 활동량을 4단계 "기강" 척도로 보여준다.
 *
 * 활동지수(포인트 원장 합산)를 숫자로 노출하던 것을 대체한다. 숫자는 크루 규모에선
 * 편차가 작아 의미가 안 잡히고, "지금 잘 달리고 있나"를 한눈에 주는 게 카드의 목적에 맞다.
 * **"포인트"·원장·적립 규칙은 여전히 노출하지 않는다**(기강 포인트 히든 운영).
 *
 * 판정은 최근 90일 활동 건수(모임 참석 + 대회 기록)를 주 지표로, 마지막 활동일을 보조로 쓴다.
 * 라벨은 달리는 상태 자체를 말한다(러너 톤). 양 끝(그 자체/실종)만 "기강"을 쓰고 중간 두 단계는
 * 사실대로 — 3개월 6~9회는 월 2회꼴이라 "거의 안 빠진다"고 과장하지 않는다.
 */
export type ActivityMood = {
  /** 단계 키 — 아이콘 선택용 */
  level: MoodLevel;
  /** 표정 라벨 */
  label: string;
  /** 카드에 곁들이는 한마디 */
  message: string;
  /** 게이지 점등 칸수 (1~4) */
  litSteps: number;
};

export { MOOD_STEPS } from "@/lib/mood-scale";

/** 단계 키 + 한마디 → 컨디션. 라벨·칸수는 공유 척도에서 가져온다(어휘 드리프트 방지) */
function mood(level: MoodLevel, message: string): ActivityMood {
  return { level, ...MOOD_SCALE[level], message };
}

/**
 * 최근 90일 활동 건수 + 마지막 활동일 → 컨디션 4단계.
 *
 * 임계값(10 / 6 / 1 / 0)은 3개월 기준으로 운영자가 정한 값이다.
 * 월 3회 이상이면 최상위, 월 2회면 상위, 한 번이라도 나오면 중위, 전무면 최하위.
 *
 * @param recentCount 최근 90일 모임 참석 + 대회 기록 건수
 * @param lastActvDt  마지막 활동일(YYYY-MM-DD). 없으면 활동 이력 자체가 없음
 */
export function getActivityMood(
  recentCount: number,
  lastActvDt: string | null,
): ActivityMood {
  if (recentCount >= 10) return mood("blazing", "내가 곧 기강의 기준");
  if (recentCount >= 6) return mood("steady", "슬슬 기강 좀 잡아볼까");
  if (recentCount >= 1) return mood("resting", "기강에 관심이 생기는 정도");

  // 90일간 활동 0 — 이력이 아예 없는 신규와 오래 쉰 멤버를 구분한다.
  // 날짜 차이는 **양쪽 다 KST**로 맞춘다 — 한쪽만 고치면 여전히 어긋난다(§lib/dayjs nowKST).
  const days = lastActvDt
    ? todayStartKST().diff(parseEventTime(lastActvDt).startOf("day"), "day")
    : null;

  return mood(
    "dormant",
    days == null ? "첫 발자국을 기다리는 중" : `${days}일째 실종… 수배 중`,
  );
}

/** 종목 코드 → 화면 라벨 */
const SPORT_LABEL: Record<string, string> = {
  road_run: "로드",
  trail_run: "트레일",
  ultra: "울트라",
  triathlon: "철인3종",
  cycling: "사이클",
};

/** 종목 코드 → `sport-*` 배경 토큰 클래스 (도트 색). DESIGN.md 종목 토큰과 1:1 */
const SPORT_DOT: Record<string, string> = {
  road_run: "bg-sport-road-run",
  trail_run: "bg-sport-trail-run",
  ultra: "bg-sport-ultra",
  triathlon: "bg-sport-triathlon",
  cycling: "bg-sport-cycling",
};

export function getSportLabel(sport: string): string {
  return SPORT_LABEL[sport] ?? sport;
}

export function getSportDotCls(sport: string): string {
  return SPORT_DOT[sport] ?? "bg-muted-foreground";
}

/**
 * 기록 한 줄의 표시 라벨.
 *
 * 로드는 거리(FULL·HALF·10K)가 곧 이름이라 거리만, 철인·사이클은 종목명을 쓴다
 * (RPC가 종목당 1건만 내려주므로 거리 구분이 불필요).
 */
export function getRecordLabel(record: MemberCardRecord): string {
  if (record.sport === "road_run") {
    return record.evt === "FULL" ? "풀코스" : record.evt === "HALF" ? "하프" : record.evt;
  }
  return getSportLabel(record.sport);
}

/**
 * 기록 목록 한 줄의 **코드 표기** — `FULL` · `HALF` · `10K`.
 *
 * `getRecordLabel`(풀코스·하프)과 갈라 둔 건 자리가 다르기 때문이다:
 * 카드의 기록 목록은 바로 아래 페이스 추이 차트 범례(`10K HALF FULL`)와 나란히 서므로
 * 같은 것을 두 이름으로 부르면 안 되고, 기강이야기 리드는 `종목 · 풀코스`처럼 **한국어 문장
 * 안**이라 코드가 어색하다. 한쪽을 고쳐 다른 쪽까지 끌려가지 않게 함수를 둘로 둔다.
 *
 * 철인3종·사이클은 거리 규격이 아니라 **종목 이름**이라 여기서도 한글을 쓴다.
 */
export function getRecordCodeLabel(record: MemberCardRecord): string {
  if (record.sport === "road_run") return record.evt.toUpperCase();
  return getSportLabel(record.sport);
}

/** NEW 태그를 붙일 기간 — 최근 90일 이내 기록 */
const NEW_RECORD_DAYS = 90;

/** 최근 90일 이내 기록인가 (KST 기준) */
export function isNewRecord(raceDt: string | null): boolean {
  if (!raceDt) return false;
  const diff = todayStartKST().diff(parseEventTime(raceDt).startOf("day"), "day");
  return diff >= 0 && diff <= NEW_RECORD_DAYS;
}

/**
 * 대회 D-day 문구 — "D-3" / "D-DAY".
 * 이미 지난 대회면 null.
 */
export function getRaceDday(sttDt: string): string | null {
  const diff = parseEventTime(sttDt).startOf("day").diff(todayStartKST(), "day");
  if (diff < 0) return null;
  return diff === 0 ? "D-DAY" : `D-${diff}`;
}

/** 값이 아직 없는 기록 칸 — "0초에 완주"로 읽힐 여지가 있는 `00:00:00` 대신 빈 눈금을 쓴다 */
const PB_EMPTY_TIME = "--:--";

/** 로드 3종 — 기록이 없어도 늘 자리를 지키는 칸. 순서가 곧 화면 순서다 */
const PB_ROAD_SLATE = ["FULL", "HALF", "10K"] as const;

/**
 * 개인 최고기록 한 줄.
 *
 * `value`가 `null`이면 아직 안 채운 칸이다 — 화면은 `--:--`(UTMB는 `--`)를 찍고 종목 점도
 * 회색으로 죽여 "안 켜진 줄"로 보이게 한다. 편집판의 UTMB 줄은 상태에 따라 진입점이 갈린다:
 * 미연동이면 값 자리에 `연동하기` pill, 연동됐으면 라벨 옆 연필(수정·해제·최신화가 모두
 * 같은 다이얼로그 하나로 들어간다).
 */
export type PbRow = {
  /** 화면 라벨 — `FULL` · `HALF` · `10K` · `철인3종` · `UTMB INDEX` */
  label: string;
  /** 종목 도트 색 클래스 */
  dotCls: string;
  /** 표시값. `null`이면 미입력 */
  value: string | null;
  /** UTMB 행인가 — 편집판이 이 줄에 연동 진입점(pill·연필)을 세울지 판단한다 */
  isUtmb: boolean;
  /** 최근 90일 이내 기록 */
  isNew: boolean;
};

/**
 * 기록 칸을 **늘 같은 골격**으로 세운다 — FULL / HALF / 10K (+ 있는 종목) / UTMB INDEX.
 *
 * 빈 판(`아직 등록된 기록이 없습니다`)을 세우는 대신 칸을 남겨 두는 이유: 채워야 할 칸이
 * 몇 개인지가 눈에 보이고, 기록을 넣은 뒤에도 레이아웃이 안 바뀐다.
 *
 * 로드 3종은 값이 없어도 자리를 지키지만 **철인3종·사이클은 있을 때만** 붙인다 —
 * 로드 러너의 카드에 안 켜진 철인 칸까지 세우면 "해야 할 일"처럼 보인다.
 */
export function buildPbRows(
  bestRecords: MemberCardRecord[],
  utmbIndex: number | null,
): PbRow[] {
  const byEvt = new Map<string, MemberCardRecord>();
  const others: MemberCardRecord[] = [];
  for (const rec of bestRecords) {
    if (rec.sport === "road_run") {
      byEvt.set(rec.evt.toUpperCase(), rec);
    } else {
      others.push(rec);
    }
  }

  const rows: PbRow[] = PB_ROAD_SLATE.map((evt) => {
    const rec = byEvt.get(evt);
    return {
      label: evt,
      dotCls: rec ? getSportDotCls("road_run") : "bg-border",
      value: rec ? secondsToTime(rec.rec_time_sec) : null,
      isUtmb: false,
      isNew: rec ? isNewRecord(rec.race_dt) : false,
    };
  });

  for (const rec of others) {
    rows.push({
      label: getRecordCodeLabel(rec),
      dotCls: getSportDotCls(rec.sport),
      value: secondsToTime(rec.rec_time_sec),
      isUtmb: false,
      isNew: isNewRecord(rec.race_dt),
    });
  }

  rows.push({
    label: "UTMB INDEX",
    dotCls: utmbIndex != null ? getSportDotCls("trail_run") : "bg-border",
    value: utmbIndex != null ? String(utmbIndex) : null,
    isUtmb: true,
    isNew: false,
  });

  return rows;
}

/** 미입력 칸에 찍을 문자열 — UTMB 인덱스는 시간이 아니라 점수라 자릿수를 흉내 내지 않는다 */
export function pbEmptyValue(row: PbRow): string {
  return row.isUtmb ? "--" : PB_EMPTY_TIME;
}

/**
 * 페이스 추이를 그릴 만한가 — **같은 종목 기록이 2건 이상**이어야 한다.
 *
 * 점 하나짜리는 추이가 아니다. 판정은 **전체 이력 기준**이고, 기간 토글(최근 1년/전체)로
 * 점이 줄어드는 건 차트 안에서 처리한다 — 섹션이 토글마다 나타났다 사라지면 그게 더 이상하다.
 */
export function hasPaceTrend(
  records: MemberCardRaceRecord[] | undefined,
): boolean {
  if (!records?.length) return false;
  const seen = new Set<string>();
  for (const rec of records) {
    if (seen.has(rec.evt)) return true;
    seen.add(rec.evt);
  }
  return false;
}

/** 카드 payload → PaceChart props. 두 화면(탭·팝업)이 같은 변환을 쓴다 */
export function toPaceChartRecords(
  records: MemberCardRaceRecord[] | undefined,
): {
  event_type: string;
  record_time_sec: number;
  race_name: string;
  race_date: string;
}[] {
  return (records ?? []).map((rec) => ({
    event_type: rec.evt,
    record_time_sec: rec.rec_time_sec,
    race_name: rec.race_nm,
    race_date: rec.race_dt,
  }));
}

/** 합류일 기준 "N일째" — join_dt가 없으면 null */
export function getDaysSinceJoin(joinDt: string | null): number | null {
  if (!joinDt) return null;
  const days = todayStartKST().diff(parseEventTime(joinDt).startOf("day"), "day");
  return days >= 0 ? days + 1 : null;
}

/**
 * 소개 섹션 데이터 — 온보딩에서 받은 값을 카드용으로 정리한다.
 *
 * 카드에서는 "러닝 프로필"(rows)과 "가입 목적"(purposes/purposeTxt) 두 섹션으로 나눠 쓴다.
 * 목적 칩은 **짧은 라벨**(JOIN_PURP_SHORT_LABELS = `코칭`·`대회`…)로 렌더하되,
 * `코칭`만 봐선 무슨 뜻인지 안 읽히므로 **문장형 라벨**(JOIN_PURP_LABELS = `자세·훈련 코칭을
 * 받고 싶어요`)을 칭호처럼 탭 툴팁으로 붙인다 — 그래서 칩마다 short/full을 함께 내려준다.
 * 자유 텍스트(join_purp_txt)는 애초에 남에게 보여줄 글이 아니라 RPC가 안 준다.
 */
export type MemberIntro = {
  /**
   * 가입 목적 칩 — `short`는 칩에 찍고 `full`은 탭 툴팁에 뜬다. `purposeTxt`가 있으면 비어 있다.
   */
  purposes: { short: string; full: string }[];
  /**
   * 본인이 직접 쓴 목적 한마디 — 있으면 칩 대신 이걸 보여준다.
   * 온보딩에서 칩을 고르고도 따로 문장을 남겼다면, 그 문장이 더 정확한 자기소개다.
   */
  purposeTxt: string | null;
  /** 라벨-값 행 (평균 페이스 / 평균 거리 / 가까운 역) */
  rows: { label: string; value: string }[];
};

/**
 * 가입 목적 코드 배열 → 칩 데이터(short/full 쌍). 알 수 없는 코드는 건너뛴다.
 * `getMemberIntro`와 아래 헬퍼가 공유하는 단일 변환.
 */
function toPurposeChips(
  cds: string[] | null | undefined,
): { short: string; full: string }[] {
  return (cds ?? [])
    .map((cd) => {
      const key = cd as (typeof JOIN_PURP_CODES)[number];
      const short = JOIN_PURP_SHORT_LABELS[key];
      if (!short) return null;
      return { short, full: JOIN_PURP_LABELS[key] ?? short };
    })
    .filter((chip): chip is { short: string; full: string } => chip !== null);
}

/**
 * 러닝 프로필 한 줄 — `6'00"/km · 8km · 합정역`.
 *
 * 상세 카드는 라벨-값 행(`MemberIntro.rows`)으로 펼치지만, 간단 카드는 한 줄에 이어붙인다.
 * 라벨이 사라지므로 페이스에는 `/km`를 붙여야 숫자가 뭘 뜻하는지 알 수 있다.
 * 아무것도 없으면 null — 줄 자체를 그리지 않는다.
 */
export function getRunningProfileLine(
  profile: {
    avg_pace_cd: string | null;
    avg_run_dist_km: number | null;
    near_stn_nm?: string | null;
  } | null,
): string | null {
  if (!profile) return null;

  const parts: string[] = [];
  const paceCd = profile.avg_pace_cd as (typeof AVG_PACE_CODES)[number] | null;
  // UNKNOWN("잘 모르겠어요")은 정보가 없는 것과 같다.
  if (paceCd && paceCd !== "UNKNOWN" && PACE_LABELS[paceCd]) {
    // P730_OVER만 숫자가 아니라 구간 이름("슬로우러닝")이라 "/km"를 붙이면 말이 안 된다.
    parts.push(
      paceCd === "P730_OVER" ? PACE_LABELS[paceCd] : `${PACE_LABELS[paceCd]}/km`,
    );
  }
  if (profile.avg_run_dist_km != null && profile.avg_run_dist_km > 0) {
    parts.push(`${profile.avg_run_dist_km}km`);
  }
  const stn = profile.near_stn_nm?.trim();
  if (stn) parts.push(stn.endsWith("역") ? stn : `${stn}역`);

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * 러닝 프로필을 아이콘 배지 조각들로 — 간단 카드에서 페이스·거리·역을 각각의 칩으로 그린다.
 *
 * `getRunningProfileLine`이 점으로 이어 붙인 한 줄이라면, 이쪽은 아이콘을 붙이기 위해
 * 조각을 나눠 돌려준다. 아이콘 자체는 렌더 쪽(카드)이 붙인다 — lib는 lucide에 의존하지 않는다.
 * `kind`로 어떤 아이콘을 붙일지 카드가 고른다.
 */
export type RunningProfileChip = {
  kind: "pace" | "dist" | "stn";
  value: string;
};

export function getRunningProfileChips(
  profile: {
    avg_pace_cd: string | null;
    avg_run_dist_km: number | null;
    near_stn_nm?: string | null;
  } | null,
): RunningProfileChip[] {
  if (!profile) return [];

  const chips: RunningProfileChip[] = [];
  const paceCd = profile.avg_pace_cd as (typeof AVG_PACE_CODES)[number] | null;
  if (paceCd && paceCd !== "UNKNOWN" && PACE_LABELS[paceCd]) {
    chips.push({
      kind: "pace",
      // 한 줄(getRunningProfileLine)과 같은 이유로 P730_OVER만 "/km"를 안 붙인다.
      value: paceCd === "P730_OVER" ? PACE_LABELS[paceCd] : `${PACE_LABELS[paceCd]}/km`,
    });
  }
  if (profile.avg_run_dist_km != null && profile.avg_run_dist_km > 0) {
    chips.push({ kind: "dist", value: `${profile.avg_run_dist_km}km` });
  }
  const stn = profile.near_stn_nm?.trim();
  if (stn) {
    chips.push({ kind: "stn", value: stn.endsWith("역") ? stn : `${stn}역` });
  }
  return chips;
}

/**
 * 가입 목적 코드 → 짧은 라벨 목록. 한마디(txt) 유무와 무관하게 **코드만** 라벨로 바꾼다.
 * 한마디와 칩을 함께 보여줄지(둘 다)는 호출부가 정한다 — 이 함수는 판단하지 않는다.
 */
export function getJoinPurposeLabelsFromCds(
  cds: string[] | null | undefined,
): string[] {
  return (cds ?? [])
    .map((cd) => JOIN_PURP_SHORT_LABELS[cd as (typeof JOIN_PURP_CODES)[number]])
    .filter((label): label is string => Boolean(label));
}

/**
 * 가입 목적 짧은 라벨 목록 — 칩으로 렌더. 직접 쓴 한마디가 있으면 빈 배열(카드가 한마디를 대신 쓴다).
 * 한마디를 우선하는 기존 화면(MemberCardCompact·PersonProfile)이 쓴다.
 */
export function getJoinPurposeLabels(
  profile: {
    join_purp_cds?: string[] | null;
    join_purp_txt?: string | null;
  } | null,
): string[] {
  if (!profile) return [];
  if (profile.join_purp_txt?.trim()) return [];
  return getJoinPurposeLabelsFromCds(profile.join_purp_cds);
}

/** 소개할 내용이 하나도 없으면 null — 섹션 자체를 그리지 않는다 */
export function getMemberIntro(
  profile: {
    avg_pace_cd: string | null;
    avg_run_dist_km: number | null;
    near_stn_nm?: string | null;
    join_purp_cds?: string[] | null;
    join_purp_txt?: string | null;
  } | null,
): MemberIntro | null {
  if (!profile) return null;

  // 직접 쓴 한마디가 있으면 칩은 버린다 — 태그 나열보다 본인 말이 낫다.
  const purposeTxt = profile.join_purp_txt?.trim() || null;
  const purposes = purposeTxt ? [] : toPurposeChips(profile.join_purp_cds);

  const rows = getRunningProfileRows(profile);

  if (purposes.length === 0 && rows.length === 0 && !purposeTxt) return null;
  return { purposes, purposeTxt, rows };
}

/**
 * 러닝 프로필 3칸 — **미입력도 자리를 지킨다**(값이 `null`).
 *
 * 편집판은 "뭘 아직 안 썼는지"가 보여야 채우므로 빈 칸에 `—`를 찍고, 공개판은 남에게 빈 줄을
 * 보일 이유가 없어 채워진 것만 쓴다. **이 함수가 라벨·값 규칙의 단일 정본**이고,
 * `getRunningProfileRows`(채워진 것만)는 여기서 파생된다 — 두 벌로 두면 라벨 문구나
 * UNKNOWN 처리가 한쪽만 고쳐져 편집판과 공개판이 조용히 어긋난다.
 */
export function getRunningProfileSlots(
  profile: {
    avg_pace_cd: string | null;
    avg_run_dist_km: number | null;
    near_stn_nm?: string | null;
  } | null,
): { label: string; value: string | null }[] {
  const paceCd = profile?.avg_pace_cd as (typeof AVG_PACE_CODES)[number] | null;
  // UNKNOWN("잘 모르겠어요")은 정보가 없는 것과 같게 취급한다(rows와 동일 규칙).
  const pace =
    paceCd && paceCd !== "UNKNOWN" && PACE_LABELS[paceCd]
      ? PACE_LABELS[paceCd]
      : null;

  const dist =
    profile?.avg_run_dist_km != null && profile.avg_run_dist_km > 0
      ? `${profile.avg_run_dist_km}km`
      : null;

  const stn = profile?.near_stn_nm?.trim();

  return [
    { label: "평균 페이스", value: pace },
    { label: "평균 거리", value: dist },
    { label: "가까운 역", value: stn ? (stn.endsWith("역") ? stn : `${stn}역`) : null },
  ];
}

/**
 * 러닝 프로필 라벨-값 행 — `평균 페이스 / 평균 거리 / 가까운 역`.
 *
 * 아이콘 칩(`getRunningProfileChips`)과 달리 **항목 이름을 글자로 말한다**. 칩은 폭이
 * 좁은 목록용이고, 이쪽은 "이 숫자가 뭔지" 처음 보는 사람에게 설명해야 하는 자리용이다
 * (상세 카드의 러닝 프로필 섹션, 리드의 새 얼굴 슬롯) — 처음 보는 사람을 소개하는 칸에서
 * `⏱ 6'00"`만 있으면 그게 평균인지 최고기록인지 알 수 없다.
 *
 * 상세 카드(`getMemberIntro`)와 리드가 같은 함수를 쓴다 — 한쪽만 고치면 라벨이 갈라진다.
 *
 * **`getRunningProfileSlots`에서 파생한다.** 라벨 문구·UNKNOWN 처리·역 접미 규칙을 두 벌로
 * 두면 한쪽만 수정됐을 때 편집판과 공개판이 조용히 어긋나므로, 규칙은 슬롯 쪽 한 곳에만 둔다.
 */
export function getRunningProfileRows(
  profile: {
    avg_pace_cd: string | null;
    avg_run_dist_km: number | null;
    near_stn_nm?: string | null;
  } | null,
): { label: string; value: string }[] {
  if (!profile) return [];

  return getRunningProfileSlots(profile).filter(
    (slot): slot is { label: string; value: string } => slot.value !== null,
  );
}
