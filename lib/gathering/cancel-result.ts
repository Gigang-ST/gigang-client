/**
 * `cancel_gthr_attendance` RPC 응답 해석 — 두 호출부(본인 취소·운영진 제거)가 공유한다.
 *
 * RPC 가 `{promoted: uuid[], notify_open_seat: boolean}` 을 돌려준다.
 * 빈 자리 알림 여부를 앱이 조립하지 않고 **트랜잭션 안에서 계산된 값 하나**를 쓰는 이유는
 * 20260914100000_gthr_cancel_result_jsonb.sql 헤더 참고(정원 초과 모임에서 빈자리 없는
 * 알림이 나가던 문제, 2시간 경계에서 승급과 알림 판정의 시각이 갈리던 문제).
 */

export type CancelAttendanceResult = {
  /** 이 취소로 대기 → 참석 확정된 mem_id */
  promoted: string[];
  /** 선착순 구간이면서 실제 빈자리가 있어 대기자에게 빈 자리 알림을 보내야 하는가 */
  notifyOpenSeat: boolean;
};

const EMPTY: CancelAttendanceResult = { promoted: [], notifyOpenSeat: false };

const onlyStrings = (xs: unknown[]): string[] => xs.filter((x): x is string => typeof x === "string");

export function parseCancelResult(raw: unknown): CancelAttendanceResult {
  if (Array.isArray(raw)) {
    // 옛 RPC(RETURNS uuid[])가 응답하는 경우 — 배포 순서가 뒤집혀 코드가 먼저 나가도
    // 승급 알림은 이어진다. 빈자리 판정 값이 없으니 빈 자리 알림만 보내지 않는다.
    return { promoted: onlyStrings(raw), notifyOpenSeat: false };
  }
  if (raw && typeof raw === "object") {
    const r = raw as { promoted?: unknown; notify_open_seat?: unknown };
    return {
      promoted: Array.isArray(r.promoted) ? onlyStrings(r.promoted) : [],
      notifyOpenSeat: r.notify_open_seat === true,
    };
  }
  return EMPTY;
}
