import { dayjs, parseEventTime } from "@/lib/dayjs";

/**
 * 지난 일정(모임·일정글) 판정 — KST 날짜 기준.
 *
 * (종료일시 ?? 시작일시)의 KST 날짜가 오늘 이전이면 "지난 일정".
 * 당일 일정은 그날 자정(KST)까지는 지난 것으로 보지 않는다 —
 * 모임 종료 직후 참석 체크·내용 보완이 흔하기 때문. 홈탭 지난 일정 dim 기준과 동일.
 *
 * sttAt/endAt에 날짜만("YYYY-MM-DD") 와도 안전하다 — parseEventTime이 KST 자정으로 고정한다.
 * (그냥 dayjs("2026-07-20")로 파싱하면 절대시각이 실행 환경 로컬 자정이 되어, Vercel 서버(UTC)와
 *  브라우저(KST)에서 최대 9시간 어긋나 자정 근처의 지난-일정 판정이 하루 갈릴 수 있다.)
 *
 * 지난 일정은 수정·삭제·참석·참석해제 불가 (관리자만 예외).
 * 서버 액션 검증과 클라이언트 버튼 노출 양쪽에서 공용으로 사용한다.
 */
export function isPastEventKst(sttAt: string, endAt?: string | null): boolean {
  const baseline = parseEventTime(endAt ?? sttAt).tz("Asia/Seoul");
  return baseline.isBefore(dayjs().tz("Asia/Seoul").startOf("day"));
}

/** 지난 일정 조작 차단 시 공통 에러 메시지 */
export const PAST_EVENT_ERROR = "지난 일정은 변경할 수 없습니다.";

/**
 * 지난 일정 잠금 여부 — 관리자는 항상 잠기지 않는다.
 * 서버 액션 검증과 클라이언트 버튼 노출이 이 한 곳의 판정을 공유한다.
 */
export function isPastLockedFor(
  isAdmin: boolean | null | undefined,
  sttAt: string,
  endAt?: string | null,
): boolean {
  return !isAdmin && isPastEventKst(sttAt, endAt);
}
