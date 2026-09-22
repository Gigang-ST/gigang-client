import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkSignupBirthday, signupBirthMax } from "@/lib/validations/member";

/**
 * 가입 생년월일 범위 — "86년생부터 한국 나이 20살까지"(이용약관 §가입 자격).
 * 위쪽 끝은 숫자로 박지 않고 KST 오늘에서 계산한다 — 예전엔 `max="2008-12-31"`로 박혀 있어
 * 2026년에 한국 나이 19살인 2008년생이 통과했고, 해가 바뀌면 한 살씩 더 어린 사람이 통과할 구조였다.
 */
describe("가입 생년월일", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // KST 2026-09-24 10:00
    vi.setSystemTime(new Date("2026-09-24T01:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("상한은 올해 한국 나이 20살이 되는 해의 12월 31일이다", () => {
    expect(signupBirthMax()).toBe("2007-12-31");
  });

  it("KST 경계 — UTC로는 아직 작년이어도 KST 연도로 계산한다", () => {
    // UTC 2026-12-31 16:00 = KST 2027-01-01 01:00
    vi.setSystemTime(new Date("2026-12-31T16:00:00Z"));
    expect(signupBirthMax()).toBe("2008-12-31");
  });

  it("생일을 따지지 않는다 — 올해 20살이 되는 해에 태어났으면 생일 전이어도 통과", () => {
    expect(checkSignupBirthday("2007-12-31")).toBeNull();
    expect(checkSignupBirthday("2008-01-01")).not.toBeNull();
  });

  it("1986년생은 통과, 1985년생은 막힌다", () => {
    expect(checkSignupBirthday("1986-01-01")).toBeNull();
    expect(checkSignupBirthday("1985-12-31")).not.toBeNull();
  });

  it("빈 값·형식이 다른 값은 막힌다", () => {
    expect(checkSignupBirthday("")).not.toBeNull();
    expect(checkSignupBirthday("1990/01/01")).not.toBeNull();
  });
});
