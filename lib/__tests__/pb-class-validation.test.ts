/**
 * PB 클래스 2·3단계 입력 검증 — 서버 액션이 믿는 경계(범위·중복·문구)를 못박는다.
 * 점수 산식은 pb-class-score.test.ts, 조립은 queries/__tests__/pb-class-game.test.ts 가 맡는다.
 */
import { describe, expect, it } from "vitest";

import { PB_CLASS_DEFAULT_CFG } from "@/lib/pb-class";
import { PB_DEFAULT_SESS_PLANS } from "@/lib/pb-class-plan";
import { PB_DEFAULT_RULE } from "@/lib/pb-class-score";
import {
  checkGoalCap,
  pbAssignRowsSchema,
  pbCfgSchema,
  pbGoalSecSchema,
  pbGroupInputSchema,
  pbParticipantUpdateSchema,
  pbRecordRowsSchema,
  pbRecSecSchema,
  pbRecTypeSchema,
  pbRuleSchema,
  pbSessNoSchema,
  pbSessPlanSchema,
} from "@/lib/validations/pb-class";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_G = "33333333-3333-4333-8333-333333333333";

describe("pbCfgSchema — 마일리지런 할인(mlgDcAmt)", () => {
  it("기본 설정은 통과한다(기본값과 스키마가 어긋나면 첫 저장부터 막힌다)", () => {
    expect(pbCfgSchema.safeParse(PB_CLASS_DEFAULT_CFG).success).toBe(true);
  });

  it("0~100,000원 정수만 — 음수·소수·상한 초과·빠진 값은 거절", () => {
    const withDc = (mlgDcAmt: unknown) => pbCfgSchema.safeParse({ ...PB_CLASS_DEFAULT_CFG, mlgDcAmt });
    expect(withDc(0).success).toBe(true);
    expect(withDc(100_000).success).toBe(true);
    expect(withDc(-1).success).toBe(false);
    expect(withDc(100_001).success).toBe(false);
    expect(withDc(2_500.5).success).toBe(false);
    expect(withDc(undefined).success).toBe(false);
    const high = withDc(100_001);
    expect(high.success ? "" : high.error.issues[0].message).toContain("100,000원");
  });

  it("할인액이 보증금보다 커도 스키마는 막지 않는다(fees 계산이 보증금까지만 깎는다)", () => {
    expect(pbCfgSchema.safeParse({ ...PB_CLASS_DEFAULT_CFG, depositAmt: 3_000, mlgDcAmt: 5_000 }).success).toBe(true);
  });
});

describe("pbParticipantUpdateSchema — depositDcAmt", () => {
  const base = { joinWkNo: 1, depositAmt: 25_000, entryFeeAmt: 10_000 };

  it("할인액은 선택 — 안 보내는 이전 폼도 통과한다", () => {
    const r = pbParticipantUpdateSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.depositDcAmt).toBeUndefined();
  });

  it("보내면 0 이상 정수만", () => {
    expect(pbParticipantUpdateSchema.safeParse({ ...base, depositDcAmt: 5_000 }).success).toBe(true);
    expect(pbParticipantUpdateSchema.safeParse({ ...base, depositDcAmt: -1 }).success).toBe(false);
    expect(pbParticipantUpdateSchema.safeParse({ ...base, depositDcAmt: 1.5 }).success).toBe(false);
  });
});

describe("pbSessPlanSchema — 회차별 훈련표", () => {
  const valid = {
    sessNo: 2,
    phaseNm: "기초",
    ttl: "400m 반복",
    mainTxt: "8 × 400m @ P-15초",
    easyTxt: "6 × 400m",
    purpTxt: "스피드 감각",
    noteTxt: "게임팀 발표",
  };

  it("기본 훈련표 13칸이 전부 통과한다(기본값과 스키마가 어긋나면 「기본 훈련표 불러오기」 뒤 첫 수정부터 막힌다)", () => {
    expect(PB_DEFAULT_SESS_PLANS).toHaveLength(13);
    for (const p of PB_DEFAULT_SESS_PLANS) {
      const r = pbSessPlanSchema.safeParse(p);
      expect(r.success, `sessNo ${p.sessNo}`).toBe(true);
      // 통과한 값이 입력과 같다 — 스키마가 기본값을 조용히 바꾸지 않는다
      expect(r.success && r.data).toEqual(p);
    }
  });

  it("앞뒤 공백을 걷는다", () => {
    const r = pbSessPlanSchema.parse({ ...valid, ttl: "  언덕 반복  ", mainTxt: "\n8회 \n" });
    expect(r.ttl).toBe("언덕 반복");
    expect(r.mainTxt).toBe("8회");
  });

  it("선택 칸(E 세션·비고)은 빈 문자열·공백이면 null 로 접는다 — 「없으면 A~D와 같음」 판정이 어긋나지 않게", () => {
    const r = pbSessPlanSchema.parse({ ...valid, easyTxt: "   ", noteTxt: "" });
    expect(r.easyTxt).toBeNull();
    expect(r.noteTxt).toBeNull();
    expect(pbSessPlanSchema.parse({ ...valid, easyTxt: null, noteTxt: null })).toMatchObject({
      easyTxt: null,
      noteTxt: null,
    });
  });

  it("필수 칸(단계·제목·훈련 내용·목적)은 비면 거절", () => {
    for (const key of ["phaseNm", "ttl", "mainTxt", "purpTxt"] as const) {
      expect(pbSessPlanSchema.safeParse({ ...valid, [key]: "" }).success, key).toBe(false);
      expect(pbSessPlanSchema.safeParse({ ...valid, [key]: "   " }).success, key).toBe(false);
    }
  });

  it("글자 수 상한 — 단계 10 · 제목 60 · 본문류 1000(DB CHECK 와 같다)", () => {
    expect(pbSessPlanSchema.safeParse({ ...valid, phaseNm: "가".repeat(10) }).success).toBe(true);
    expect(pbSessPlanSchema.safeParse({ ...valid, phaseNm: "가".repeat(11) }).success).toBe(false);
    expect(pbSessPlanSchema.safeParse({ ...valid, ttl: "가".repeat(60) }).success).toBe(true);
    expect(pbSessPlanSchema.safeParse({ ...valid, ttl: "가".repeat(61) }).success).toBe(false);
    for (const key of ["mainTxt", "easyTxt", "purpTxt", "noteTxt"] as const) {
      expect(pbSessPlanSchema.safeParse({ ...valid, [key]: "가".repeat(1000) }).success, key).toBe(true);
      expect(pbSessPlanSchema.safeParse({ ...valid, [key]: "가".repeat(1001) }).success, key).toBe(false);
    }
  });

  it("회차 번호는 1~52 정수", () => {
    expect(pbSessPlanSchema.safeParse({ ...valid, sessNo: 1 }).success).toBe(true);
    expect(pbSessPlanSchema.safeParse({ ...valid, sessNo: 52 }).success).toBe(true);
    expect(pbSessPlanSchema.safeParse({ ...valid, sessNo: 0 }).success).toBe(false);
    expect(pbSessPlanSchema.safeParse({ ...valid, sessNo: 53 }).success).toBe(false);
    expect(pbSessPlanSchema.safeParse({ ...valid, sessNo: 2.5 }).success).toBe(false);
    expect(pbSessNoSchema.safeParse(13).success).toBe(true);
    expect(pbSessNoSchema.safeParse("13").success).toBe(false);
  });

  it("선택 칸이 undefined 로 빠지면 거절 — null 로 명시해야 한다(저장 시 NULL 로 덮이는 의도를 숨기지 않는다)", () => {
    const { easyTxt: _easy, ...rest } = valid;
    expect(pbSessPlanSchema.safeParse(rest).success).toBe(false);
  });
});

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

  it("기록 종류는 네 가지뿐 — 회원 액션(setMyPbRecord)이 같은 스키마로 거른다", () => {
    for (const t of ["BASE_5K", "MID_5K", "FINAL_10K", "DAEGU_10K"]) {
      expect(pbRecTypeSchema.safeParse(t).success, t).toBe(true);
    }
    expect(pbRecTypeSchema.safeParse("NOPE").success).toBe(false);
    expect(pbRecTypeSchema.safeParse("").success).toBe(false);
    expect(pbRecTypeSchema.safeParse(undefined).success).toBe(false);
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

describe("팀·일괄 입력", () => {
  it("팀 이름은 공백을 걷고 1~30자, 색은 1~5 또는 null", () => {
    expect(pbGroupInputSchema.parse({ grpNm: "  가팀  ", colorNo: null })).toEqual({ grpNm: "가팀", colorNo: null });
    expect(pbGroupInputSchema.safeParse({ grpNm: "   ", colorNo: 1 }).success).toBe(false);
    expect(pbGroupInputSchema.safeParse({ grpNm: "가".repeat(31), colorNo: 1 }).success).toBe(false);
    expect(pbGroupInputSchema.safeParse({ grpNm: "가팀", colorNo: 6 }).success).toBe(false);
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
