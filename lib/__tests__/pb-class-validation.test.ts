/**
 * PB 클래스 2·3단계 입력 검증 — 서버 액션이 믿는 경계(범위·중복·문구)를 못박는다.
 * 점수 산식은 pb-class-score.test.ts, 조립은 queries/__tests__/pb-class-game.test.ts 가 맡는다.
 */
import { describe, expect, it } from "vitest";

import { PB_DEFAULT_RULE } from "@/lib/pb-class-score";
import {
  checkGoalCap,
  pbAssignRowsSchema,
  pbGoalSecSchema,
  pbGroupInputSchema,
  pbMissionInputSchema,
  pbRecordRowsSchema,
  pbRecSecSchema,
  pbRuleSchema,
} from "@/lib/validations/pb-class";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_G = "33333333-3333-4333-8333-333333333333";

describe("pbRuleSchema", () => {
  it("기본 규칙은 통과한다(기본값과 스키마가 어긋나면 첫 저장부터 막힌다)", () => {
    expect(pbRuleSchema.safeParse(PB_DEFAULT_RULE).success).toBe(true);
  });

  it("범위를 벗어나면 사람 말로 막는다", () => {
    const bad = (patch: object) => pbRuleSchema.safeParse({ ...PB_DEFAULT_RULE, ...patch });
    expect(bad({ goalMaxSec: 1199 }).success).toBe(false);
    expect(bad({ goalMaxSec: 7201 }).success).toBe(false);
    expect(bad({ tenKFactor: 1.8 }).success).toBe(false);
    expect(bad({ tenKFactor: 2.4 }).success).toBe(false);
    expect(bad({ goalEditUntilWk: 0 }).success).toBe(false);
    expect(bad({ pt: { ...PB_DEFAULT_RULE.pt, attend: -1 } }).success).toBe(false);
    expect(bad({ pt: { ...PB_DEFAULT_RULE.pt, attend: 1001 } }).success).toBe(false);
    expect(bad({ pt: { ...PB_DEFAULT_RULE.pt, hostMinAttd: 0 } }).success).toBe(false);
    const r = bad({ pt: { ...PB_DEFAULT_RULE.pt, attend: 1.5 } });
    expect(r.success).toBe(false);
  });
});

describe("기록·목표 스키마", () => {
  it("기록은 10분~6시간 미만 정수 — 10분 아래는 숫자 오타로 본다", () => {
    expect(pbRecSecSchema.safeParse(600).success).toBe(true);
    expect(pbRecSecSchema.safeParse(599).success).toBe(false);
    expect(pbRecSecSchema.safeParse(21_599).success).toBe(true);
    expect(pbRecSecSchema.safeParse(0).success).toBe(false);
    expect(pbRecSecSchema.safeParse(21_600).success).toBe(false);
    expect(pbRecSecSchema.safeParse(30.5).success).toBe(false);
  });

  it("목표는 20분~120분이고 문구는 분 단위로 말한다", () => {
    expect(pbGoalSecSchema.safeParse(1200).success).toBe(true);
    expect(pbGoalSecSchema.safeParse(7200).success).toBe(true);
    const low = pbGoalSecSchema.safeParse(1199);
    expect(low.success ? "" : low.error.issues[0].message).toContain("20분");
    const high = pbGoalSecSchema.safeParse(7201);
    expect(high.success ? "" : high.error.issues[0].message).toContain("120분");
  });

  it("규칙 상한(goalMaxSec)은 스키마가 아니라 checkGoalCap 이 본다", () => {
    expect(checkGoalCap(3600, PB_DEFAULT_RULE)).toBeNull();
    expect(checkGoalCap(3601, PB_DEFAULT_RULE)).toBe("목표는 60분 이내로 입력해 주세요");
    expect(checkGoalCap(3301, { goalMaxSec: 3300 })).toBe("목표는 55분 이내로 입력해 주세요");
  });
});

describe("팀·미션·일괄 입력", () => {
  it("팀 이름은 공백을 걷고 1~30자, 색은 1~5 또는 null", () => {
    expect(pbGroupInputSchema.parse({ grpNm: "  가팀  ", colorNo: null })).toEqual({ grpNm: "가팀", colorNo: null });
    expect(pbGroupInputSchema.safeParse({ grpNm: "   ", colorNo: 1 }).success).toBe(false);
    expect(pbGroupInputSchema.safeParse({ grpNm: "가".repeat(31), colorNo: 1 }).success).toBe(false);
    expect(pbGroupInputSchema.safeParse({ grpNm: "가팀", colorNo: 6 }).success).toBe(false);
  });

  it("미션은 주차 없이(null)도 만들 수 있고 점수는 0~1000", () => {
    expect(pbMissionInputSchema.safeParse({ wkNo: null, msnNm: "측정 전원 완주", pt: 30 }).success).toBe(true);
    expect(pbMissionInputSchema.safeParse({ wkNo: 0, msnNm: "x", pt: 1 }).success).toBe(false);
    expect(pbMissionInputSchema.safeParse({ wkNo: 1, msnNm: "x", pt: -1 }).success).toBe(false);
  });

  it("편성: 빈 훈련팀 코드는 null, 같은 참가자 중복은 거절", () => {
    const ok = pbAssignRowsSchema.parse([{ prtId: UUID_A, trnGrpCd: " ", grpId: UUID_G }]);
    expect(ok[0].trnGrpCd).toBeNull();
    expect(
      pbAssignRowsSchema.safeParse([
        { prtId: UUID_A, trnGrpCd: "A", grpId: null },
        { prtId: UUID_A, trnGrpCd: "B", grpId: null },
      ]).success,
    ).toBe(false);
  });

  it("기록 일괄: null 은 삭제, 같은 (참가자, 종류) 중복은 거절", () => {
    expect(pbRecordRowsSchema.safeParse([{ prtId: UUID_A, recTypeCd: "BASE_5K", recSec: null }]).success).toBe(true);
    expect(pbRecordRowsSchema.safeParse([{ prtId: UUID_A, recTypeCd: "NOPE", recSec: 1000 }]).success).toBe(false);
    expect(
      pbRecordRowsSchema.safeParse([
        { prtId: UUID_A, recTypeCd: "BASE_5K", recSec: 1000 },
        { prtId: UUID_A, recTypeCd: "BASE_5K", recSec: 2000 },
      ]).success,
    ).toBe(false);
    // 종류가 다르면 같은 참가자도 한 번에 넣을 수 있다
    expect(
      pbRecordRowsSchema.safeParse([
        { prtId: UUID_A, recTypeCd: "BASE_5K", recSec: 1000 },
        { prtId: UUID_A, recTypeCd: "MID_5K", recSec: 2000 },
        { prtId: UUID_B, recTypeCd: "BASE_5K", recSec: 3000 },
      ]).success,
    ).toBe(true);
  });
});
