import { dayjs } from "@/lib/dayjs";
import {
  JOIN_PURP_SHORT_LABELS,
  PACE_LABELS,
  type AVG_PACE_CODES,
  type JOIN_PURP_CODES,
} from "@/lib/validations/member";

import type { MemberCardRecord } from "@/lib/queries/member-card";

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
  level: "blazing" | "steady" | "resting" | "dormant";
  /** 표정 라벨 */
  label: string;
  /** 카드에 곁들이는 한마디 */
  message: string;
  /** 게이지 점등 칸수 (1~4) */
  litSteps: number;
};

export const MOOD_STEPS = 4;

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
  if (recentCount >= 10) {
    return {
      level: "blazing",
      label: "기강 그 자체",
      message: "내가 곧 기강의 기준",
      litSteps: 4,
    };
  }
  if (recentCount >= 6) {
    return {
      level: "steady",
      label: "기강 잡아",
      message: "슬슬 기강 좀 잡아볼까",
      litSteps: 3,
    };
  }
  if (recentCount >= 1) {
    return {
      level: "resting",
      label: "기며든다",
      message: "기강에 관심이 생기는 정도",
      litSteps: 2,
    };
  }

  // 90일간 활동 0 — 이력이 아예 없는 신규와 오래 쉰 멤버를 구분한다.
  const days = lastActvDt
    ? dayjs().startOf("day").diff(dayjs(lastActvDt).startOf("day"), "day")
    : null;

  return {
    level: "dormant",
    label: "실종",
    message:
      days == null
        ? "첫 발자국을 기다리는 중"
        : `${days}일째 실종… 수배 중`,
    litSteps: 1,
  };
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

/** NEW 태그를 붙일 기간 — 최근 90일 이내 기록 */
const NEW_RECORD_DAYS = 90;

/** 최근 90일 이내 기록인가 (KST 기준) */
export function isNewRecord(raceDt: string | null): boolean {
  if (!raceDt) return false;
  const diff = dayjs().diff(dayjs(raceDt), "day");
  return diff >= 0 && diff <= NEW_RECORD_DAYS;
}

/**
 * 대회 D-day 문구 — "D-3" / "D-DAY".
 * 이미 지난 대회면 null.
 */
export function getRaceDday(sttDt: string): string | null {
  const diff = dayjs(sttDt).startOf("day").diff(dayjs().startOf("day"), "day");
  if (diff < 0) return null;
  return diff === 0 ? "D-DAY" : `D-${diff}`;
}

/** 합류일 기준 "N일째" — join_dt가 없으면 null */
export function getDaysSinceJoin(joinDt: string | null): number | null {
  if (!joinDt) return null;
  const days = dayjs().startOf("day").diff(dayjs(joinDt).startOf("day"), "day");
  return days >= 0 ? days + 1 : null;
}

/**
 * 소개 섹션 데이터 — 온보딩에서 받은 값을 카드용으로 정리한다.
 *
 * 스크린 존(이름 밑)에 점으로 이어붙이던 한 줄을 대체한다. 거기는 "누구인가"를 보여주는
 * 자리라 페이스·거리·역을 나열하면 소개가 아니라 스펙표가 됐다.
 * 목적은 **짧은 라벨 칩**(JOIN_PURP_SHORT_LABELS)으로만 쓴다 — 문장형 라벨을 나열하면
 * 카드가 문단이 되고, 자유 텍스트(join_purp_txt)는 애초에 남에게 보여줄 글이 아니라 RPC가 안 준다.
 */
export type MemberIntro = {
  /** 가입 목적 짧은 라벨 — 칩으로 렌더. `purposeTxt`가 있으면 비어 있다 */
  purposes: string[];
  /**
   * 본인이 직접 쓴 목적 한마디 — 있으면 칩 대신 이걸 보여준다.
   * 온보딩에서 칩을 고르고도 따로 문장을 남겼다면, 그 문장이 더 정확한 자기소개다.
   */
  purposeTxt: string | null;
  /** 라벨-값 행 (평균 페이스 / 평균 거리 / 가까운 역) */
  rows: { label: string; value: string }[];
};

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
  const purposes = purposeTxt
    ? []
    : (profile.join_purp_cds ?? [])
        .map((cd) => JOIN_PURP_SHORT_LABELS[cd as (typeof JOIN_PURP_CODES)[number]])
        .filter((label): label is string => Boolean(label));

  const rows: { label: string; value: string }[] = [];
  const paceCd = profile.avg_pace_cd as (typeof AVG_PACE_CODES)[number] | null;
  // UNKNOWN("잘 모르겠어요")은 정보가 없는 것과 같으므로 행을 만들지 않는다.
  if (paceCd && paceCd !== "UNKNOWN" && PACE_LABELS[paceCd]) {
    rows.push({ label: "평균 페이스", value: PACE_LABELS[paceCd] });
  }
  if (profile.avg_run_dist_km != null && profile.avg_run_dist_km > 0) {
    rows.push({ label: "평균 거리", value: `${profile.avg_run_dist_km}km` });
  }
  // 역명에 "역"이 이미 붙어 있으면 중복해서 붙이지 않는다.
  const stn = profile.near_stn_nm?.trim();
  if (stn) {
    rows.push({ label: "가까운 역", value: stn.endsWith("역") ? stn : `${stn}역` });
  }

  if (purposes.length === 0 && rows.length === 0 && !purposeTxt) return null;
  return { purposes, purposeTxt, rows };
}
