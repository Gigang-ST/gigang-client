import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signupBirthMax, signupBirthdaySchema } from "@/lib/validations/member";

/** 통과하면 true — 폼·서버 액션이 쓰는 것과 같은 스키마 */
const ok = (birthday: string) => signupBirthdaySchema.safeParse(birthday).success;

/**
 * 가입 생년월일 범위 — "86년생부터 한국 나이 20살까지"(이용약관 §가입 자격).
 * 위쪽 끝은 숫자로 박지 않고 KST 오늘에서 계산한다 — 예전엔 `max="2008-12-31"`로 박혀 있어
 * 2026년에 한국 나이 19살인 2008년생이 통과했고, 해가 바뀌면 한 살씩 더 어린 사람이 통과할 구조였다.
 */
describe("가입 생년월일", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // KST 2026-09-24 10:00
    vi.setSystemTime("2026-09-24T01:00:00Z");
  });
  afterEach(() => vi.useRealTimers());

  it("상한은 올해 한국 나이 20살이 되는 해의 12월 31일이다", () => {
    expect(signupBirthMax()).toBe("2007-12-31");
  });

  it("KST 경계 — UTC로는 아직 작년이어도 KST 연도로 계산한다", () => {
    // UTC 2026-12-31 16:00 = KST 2027-01-01 01:00
    vi.setSystemTime("2026-12-31T16:00:00Z");
    expect(signupBirthMax()).toBe("2008-12-31");
  });

  it("생일을 따지지 않는다 — 올해 20살이 되는 해에 태어났으면 생일 전이어도 통과", () => {
    expect(ok("2007-12-31")).toBe(true);
    expect(ok("2008-01-01")).toBe(false);
  });

  it("1986년생은 통과, 1985년생은 막힌다", () => {
    expect(ok("1986-01-01")).toBe(true);
    expect(ok("1985-12-31")).toBe(false);
  });

  it("빈 값·형식이 다른 값은 막힌다", () => {
    expect(ok("")).toBe(false);
    expect(ok("1990/01/01")).toBe(false);
  });

  it("달력에 없는 날짜는 막고, 윤년 2월 29일은 통과한다", () => {
    expect(ok("1990-02-30")).toBe(false);
    expect(ok("1990-13-01")).toBe(false);
    expect(ok("1991-02-29")).toBe(false); // 평년
    expect(ok("1992-02-29")).toBe(true); // 윤년
  });
});
