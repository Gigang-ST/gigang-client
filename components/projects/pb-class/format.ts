// PB 클래스 화면 공용 표기 헬퍼 — 금액을 사람이 읽는 말로 바꾼다.

import { formatKST, parseEventTime } from "@/lib/dayjs";

/**
 * 금액 표기. 만 원 단위로 딱 떨어지면 "4만 원", 아니면 "35,000원".
 *
 * 규칙 문구("참가비 4만 원 = 보증금 3만 + 참가비 1만")는 숫자를 하드코딩하지 않고
 * 관리자 설정값(cfg)에서 뽑는데, 설정이 바뀌어도 읽히는 문장으로 나와야 해서 둘로 갈랐다.
 */
export function formatWon(amount: number): string {
  if (amount > 0 && amount % 10_000 === 0) return `${amount / 10_000}만 원`;
  return `${amount.toLocaleString()}원`;
}

/**
 * 점수 표기. 주차별 평균이 섞이는 팀 점수는 소수 한 자리까지 나오므로(`round1`),
 * 정수면 정수로, 아니면 한 자리로 — "120.0점"처럼 의미 없는 .0 을 달지 않는다.
 */
export function formatPt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}

/**
 * 시간 한도 표기. 60분처럼 분 단위로 딱 떨어지면 "60분", 아니면 "45:30" 같은 시계 표기.
 * 한도(`goalMaxSec`)는 관리자 설정값이라 "1:00:00 이내"보다 "60분 이내"가 사람이 읽는 말이다.
 */
export function formatLimit(sec: number): string {
  if (sec > 0 && sec % 60 === 0) return `${sec / 60}분`;
  const h = Math.floor(sec / 3600);
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${Number(m)}:${s}`;
}

/**
 * date 컬럼(`_dt`, "YYYY-MM-DD") → "11/4(수)".
 * `parseEventTime`이 date-only 를 KST 자정으로 고정해 주므로 서버(UTC)에서 찍어도 하루 밀리지 않는다.
 */
export function formatDtShort(dt: string): string {
  return parseEventTime(dt).format("M/D(dd)");
}

/** timestamptz(`_at`) → "11/4(수) 19:30" — KST 로 찍는다(AGENTS.md §날짜) */
export function formatAtShort(at: string): string {
  return formatKST(at, "M/D(dd) HH:mm");
}

/**
 * 기간 표기 — 같은 해면 끝 날짜의 연도를 생략한다("2026.11.4 – 12.30"),
 * 해를 넘기면 둘 다 적는다("2026.11.4 – 2027.2.9"). 겨울 클래스는 거의 항상 해를 넘긴다.
 */
export function formatPeriod(sttDt: string, endDt: string): string {
  const s = parseEventTime(sttDt);
  const e = parseEventTime(endDt);
  return `${s.format("YYYY.M.D")} – ${e.format(s.year() === e.year() ? "M.D" : "YYYY.M.D")}`;
}

/** 두 date 문자열의 날짜 차이(b − a). 양쪽 다 KST 자정으로 맞춘다 */
export function dayDiff(fromDt: string, toDt: string): number {
  return parseEventTime(toDt).diff(parseEventTime(fromDt), "day");
}

/**
 * 돈의 쓰임새 문구 — 안내(참가비·정산)와 정산 캡션이 **같은 말**을 해야 한다.
 * 오너가 못박은 표현이라(2026-10-07) 화면마다 손으로 풀어 쓰면 한쪽만 옛 문구("회식비·대회 참가비",
 * "운영(장소·용품 등)")로 남는다. 한 곳에서 내보낸다.
 */
export const PB_MONEY_USE_TXT = "돌려주지 않은 보증금과 참가비는 회식비와 프로젝트 운영비로 써요";
export const PB_MONEY_USE_DETAIL_TXT = "쓰임새는 동계훈련용품 · 회식비 · 대구마라톤 응원 관련 비용(계획 중)이에요";
