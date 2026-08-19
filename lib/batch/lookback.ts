import { dayjs } from "@/lib/dayjs";
import { ATTEND_GRACE_DAYS } from "@/lib/titles/types";

const KST = "Asia/Seoul";

/**
 * 마지막 성공 이력이 없을 때 되짚어 볼 기간(일).
 *
 * 첫 실행이거나 이력이 오래 끊겼을 때의 안전망이다. 너무 짧으면 그 사이 활동을 놓치고
 * (엔진이 비회수라 놓친 칭호는 다음 기회를 기다려야 한다), 너무 길면 좁히는 의미가 없어진다.
 */
export const DEFAULT_LOOKBACK_DAYS = 14;

/**
 * 일 배치가 이번에 **새로 볼 구간의 시작일**(KST, YYYY-MM-DD).
 *
 * 배치는 전원이 아니라 "이 구간에 활동한 사람"만 평가한다 — 참석 계열은 창에 새 모임이
 * 들어온 사람만 값이 커지므로 나머지를 도는 건 낭비다. 그래서 **이 구간을 잘못 잡으면
 * 칭호가 조용히 안 붙는다**(부여 실패는 에러를 안 내므로 눈에 안 띈다).
 *
 * 지난 실행이 본 상한은 `그 실행일 − ATTEND_GRACE_DAYS`였다. 그 **다음 날**부터가 이번에
 * 새로 보는 구간이라, 크론이 며칠 밀려도 그 사이가 통째로 들어온다(catch-up).
 *
 * 서버 의존이 없는 순수 함수로 둔다 — DB를 끼면 테스트가 못 돈다.
 */
export function lookbackStartFrom(lastSuccessAt: string | null, asOfDt: string): string {
  const fallback = dayjs
    .tz(asOfDt, KST)
    .subtract(DEFAULT_LOOKBACK_DAYS, "day")
    .format("YYYY-MM-DD");
  if (!lastSuccessAt) return fallback;

  const since = dayjs(lastSuccessAt)
    .tz(KST)
    .subtract(ATTEND_GRACE_DAYS, "day")
    .add(1, "day")
    .format("YYYY-MM-DD");

  // 이력이 아주 오래됐으면 기본 기간으로 자른다 — 무한정 넓히면 좁히는 의미가 없다.
  // 반대로 방금 돌린 직후면 구간이 상한을 넘을 수 있어, 그때는 상한에 맞춘다
  // (빈 구간이 되면 아무도 평가하지 않는다).
  if (since < fallback) return fallback;
  return since > asOfDt ? asOfDt : since;
}
