/**
 * 마일리지런 시즌의 "달" 계산 — 순수 함수(DB·시계 없음).
 *
 * 입력은 전부 date 컬럼(`stt_dt`·`end_dt`·`base_dt`) 문자열이라 타임존이 끼지 않는다.
 * 달 목록을 `YYYY-MM` 정수 연산으로 만든다 — dayjs로 파싱하면 서버 로컬 자정 해석이 끼어
 * 경계가 밀릴 여지가 생긴다(`lib/batch/jobs/mileage-titles.ts`의 monthBounds 주석).
 */

/** `stt_dt`~`end_dt`가 걸치는 달을 `YYYY-MM`으로 오름차순 나열한다. 순서가 뒤집혀 있으면 빈 배열. */
export function seasonMonths(sttDt: string, endDt: string): string[] {
  const [sy, sm] = sttDt.slice(0, 7).split("-").map(Number);
  const [ey, em] = endDt.slice(0, 7).split("-").map(Number);
  if (![sy, sm, ey, em].every(Number.isFinite)) return [];

  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * 시즌 실행기간의 **모든 달**을 달성했는가 (마런정복자).
 *
 * - 시즌 시작 전 연습달 스냅샷(예: 4월)은 기간 밖이라 보지 않는다.
 * - 기간 안 어느 달이든 스냅샷이 없거나 미달성이면 false — 중간에 합류해 앞달 스냅샷이
 *   없는 사람은 "전월"을 채운 게 아니다.
 * - 마지막 달은 달이 끝나기 전에도 목표를 넘기는 순간 `achv_yn`이 켜지므로, 그때 바로 붙는다.
 */
export function isAllSeasonMonthsAchieved(
  sttDt: string | null,
  endDt: string | null,
  snaps: { base_dt: string; achv_yn: boolean | null }[],
): boolean {
  if (!sttDt || !endDt) return false;
  const months = seasonMonths(sttDt, endDt);
  if (months.length === 0) return false;

  const achieved = new Set(
    snaps.filter((s) => s.achv_yn).map((s) => s.base_dt.slice(0, 7)),
  );
  return months.every((m) => achieved.has(m));
}
