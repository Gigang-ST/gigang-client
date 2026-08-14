import { describe, expect, it } from "vitest";

import { lookbackStartFrom } from "@/lib/batch/lookback";
import { dayjs } from "@/lib/dayjs";
import { ATTEND_GRACE_DAYS } from "@/lib/titles/types";

const KST = "Asia/Seoul";
const kst = (s: string) => dayjs.tz(s, KST).toISOString();

/**
 * 일 배치는 전원이 아니라 "이 구간에 활동한 사람"만 평가한다. 구간을 잘못 잡으면
 * **칭호가 조용히 안 붙는다** — 부여 실패는 에러를 안 내므로 눈에 안 띈다.
 */
describe("일 배치 되짚기 구간 — 놓치면 칭호가 조용히 안 붙는다", () => {
  it("어제 성공했으면 하루치만 새로 본다", () => {
    // 8/13 실행이 본 상한 = 8/10. 이번(8/14, 상한 8/11)이 새로 볼 건 8/11 하루.
    expect(lookbackStartFrom(kst("2026-08-13T09:00:00"), "2026-08-11")).toBe("2026-08-11");
  });

  it("⚠️ 크론이 며칠 밀려도 그 사이가 통째로 들어온다(catch-up)", () => {
    // 8/10에 마지막 성공(상한 8/07) → 8/14 실행(상한 8/11)이면 8/08~8/11을 다 봐야 한다.
    expect(lookbackStartFrom(kst("2026-08-10T09:00:00"), "2026-08-11")).toBe("2026-08-08");
  });

  it("이력이 없으면(첫 실행) 기본 기간으로 되짚는다", () => {
    expect(lookbackStartFrom(null, "2026-08-11")).toBe("2026-07-28"); // 14일 전
  });

  it("이력이 아주 오래됐으면 기본 기간으로 자른다 — 무한정 넓히지 않는다", () => {
    expect(lookbackStartFrom(kst("2026-01-01T09:00:00"), "2026-08-11")).toBe("2026-07-28");
  });

  it("⚠️ 구간 시작이 상한을 넘지 않는다(빈 구간이 되면 아무도 평가 안 한다)", () => {
    // 방금 성공한 직후 다시 돌려도 구간이 뒤집히면 안 된다.
    const asOf = "2026-08-11";
    const since = lookbackStartFrom(kst("2026-08-14T09:00:00"), asOf);
    expect(since <= asOf).toBe(true);
  });

  it("유예 상수가 바뀌면 구간도 따라 움직인다", () => {
    // 상수를 손으로 베껴 적지 않는다 — 한쪽만 바뀌면 조용히 어긋난다.
    const lastAt = kst("2026-08-13T09:00:00");
    const expected = dayjs(lastAt).tz(KST)
      .subtract(ATTEND_GRACE_DAYS, "day").add(1, "day").format("YYYY-MM-DD");
    expect(lookbackStartFrom(lastAt, "2026-08-11")).toBe(expected);
  });

  it("KST 새벽(UTC 전날)에 돌아도 날짜가 하루 밀리지 않는다", () => {
    // KST 08:00 = UTC 전날 23:00. UTC로 세면 구간이 하루 당겨진다.
    expect(lookbackStartFrom(kst("2026-08-13T08:00:00"), "2026-08-11")).toBe("2026-08-11");
  });
});
