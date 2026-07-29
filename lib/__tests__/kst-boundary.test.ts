/**
 * KST 경계 회귀 테스트 — **UTC 서버에서 돌려도 사용자(KST) 기준으로 나와야 한다.**
 *
 * 왜 이 테스트가 있나: 배포처(Vercel)는 UTC고 브라우저는 KST라, tz 없는 `dayjs()`로 날짜를
 * 다루면 **KST 00:00~09:00 사이**에 서버와 클라이언트가 다른 "오늘"을 본다. 그 시간대에
 * 접속하면 D-day가 하루 밀리고, 제호 날짜가 어제로 찍히고, 하이드레이션도 깨진다.
 * 점검할 때마다 같은 문제가 재발해서 규칙(ESLint)과 함께 이 테스트를 못 박았다.
 *
 * **핵심은 `process.env.TZ = "UTC"`다.** 개발자 노트북(KST)에서는 버그가 재현되지 않아
 * 테스트가 통과해 버린다 — 실행 환경을 UTC로 고정해야 배포 환경을 흉내 낼 수 있다.
 * vi.setSystemTime으로 위험 구간의 한 순간(KST 7/29 00:30 = UTC 7/28 15:30)에 시계를 세운다.
 */
/**
 * ⚠️ 이 파일은 `process.env.TZ`와 `new Date()`를 **의도적으로** 직접 쓴다.
 *
 * 프로젝트 규칙(`lib/env.ts` 경유, `new Date()` 금지)은 **앱 코드**를 위한 것이다. 여기서
 * 검사하려는 대상이 바로 "실행 환경의 타임존"이라, 그걸 세우고 확인하려면 원시 수단이 필요하다.
 * `lib/dayjs`로는 프로세스 타임존을 바꿀 수 없고, `dayjs`로 오프셋을 재면 우리가 검증하려는
 * 그 계층을 우리가 만든 도구로 검증하는 셈이 되어 의미가 없다.
 *
 * 다만 **전역 오염은 되돌린다**: TZ는 워커 프로세스 단위라 같은 워커를 나눠 쓰는 다른 테스트
 * 파일로 샌다(파일 실행 순서에 따라 결과가 갈리는 종류의 사고). 원래 값을 저장해 두고 복원한다.
 */
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = "UTC";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { formatKST, nowKST, todayKST, todayStartKST } from "@/lib/dayjs";
import { getDaysSinceJoin, getRaceDday, isNewRecord } from "@/lib/member-card";

/** KST 2026-07-29 00:30 — UTC로는 아직 7/28. 이 한 순간이 모든 어긋남을 드러낸다. */
const DANGER_INSTANT = new Date("2026-07-28T15:30:00Z");

describe("KST 경계 (UTC 서버 가정)", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(DANGER_INSTANT);
  });
  afterAll(() => {
    vi.useRealTimers();
    // 같은 워커를 쓰는 다음 테스트 파일이 UTC를 물려받지 않게 되돌린다.
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  it("실행 환경이 UTC로 고정돼 있다 (이게 아니면 아래 테스트가 무의미하다)", () => {
    expect(new Date().getTimezoneOffset()).toBe(0);
  });

  it("todayKST()는 UTC 날짜(7/28)가 아니라 KST 날짜(7/29)를 준다", () => {
    expect(todayKST()).toBe("2026-07-29");
  });

  it("nowKST()의 날짜·시각이 KST 기준이다", () => {
    expect(nowKST().format("YYYY-MM-DD HH:mm")).toBe("2026-07-29 00:30");
  });

  it("todayStartKST()는 KST 자정이다 (UTC로는 전날 15:00)", () => {
    expect(todayStartKST().toISOString()).toBe("2026-07-28T15:00:00.000Z");
  });

  it("D-day가 하루 밀리지 않는다 — 8/1 대회는 KST 7/29 기준 D-3", () => {
    // tz를 안 맞추면 서버는 7/28을 오늘로 봐서 D-4를 내놓는다.
    expect(getRaceDday("2026-08-01")).toBe("D-3");
  });

  it("오늘 시작하는 대회는 D-DAY다", () => {
    expect(getRaceDday("2026-07-29")).toBe("D-DAY");
  });

  it("지난 대회는 null이다 (KST 어제 = 7/28)", () => {
    expect(getRaceDday("2026-07-28")).toBeNull();
  });

  it("가입일수는 KST 기준으로 센다 — 오늘 가입이면 1일째", () => {
    expect(getDaysSinceJoin("2026-07-29")).toBe(1);
    expect(getDaysSinceJoin("2026-07-28")).toBe(2);
  });

  it("최근 기록(90일) 경계가 KST 기준이다", () => {
    // 90일 전 = 2026-04-30. 경계 안쪽/바깥쪽이 하루 차이로 갈린다.
    expect(isNewRecord("2026-04-30")).toBe(true);
    expect(isNewRecord("2026-04-29")).toBe(false);
    // 미래 기록은 NEW가 아니다
    expect(isNewRecord("2026-07-30")).toBe(false);
  });

  it("formatKST는 timestamptz를 KST 날짜로 찍는다 (UTC로 찍으면 하루 전)", () => {
    // 이 순간에 만들어진 알림 — 서버가 로컬(UTC)로 찍으면 07.28로 나온다.
    expect(formatKST("2026-07-28T15:30:00Z", "MM.DD")).toBe("07.29");
    expect(formatKST("2026-07-28T15:30:00Z", "YYYY-MM-DD")).toBe("2026-07-29");
  });

  it("formatKST는 빈 값에 폴백을 준다", () => {
    expect(formatKST(null, "MM.DD")).toBe("");
    expect(formatKST(undefined, "MM.DD", "-")).toBe("-");
  });

  it("절대시각끼리의 경과시간은 타임존과 무관하다 (안전 패턴 확인)", () => {
    // 알림 "N분 전"이 이 형태다 — 굳이 KST로 안 바꿔도 어느 환경에서나 같은 값이 나온다.
    const created = "2026-07-28T15:00:00Z";
    expect(nowKST().diff(created, "minute")).toBe(30);
  });
});
