/**
 * PB 클래스 훈련표 — 오너 결정(2026-10-08): 조사 수정안 · 단계 대신 훈련 종류 · 측정 기록 기준 P ·
 * 개인 훈련은 주차별 안내 글. 표기 규칙과 내 P 계산을 못박는다.
 */
import { describe, expect, it } from "vitest";

import {
  PB_DEFAULT_SESS_PLANS,
  PB_TRN_KINDS,
  PB_TRN_KIND_CDS,
  fmtPace,
  trainingPace,
  withMyPace,
} from "@/lib/pb-class-plan";

describe("trainingPace — 목표와 최근 측정 중 느린 쪽", () => {
  it("측정 환산이 목표보다 느리면 기록 기준", () => {
    // 목표 45:00 → 4:30/km, 1주차 5K 23:00 → 10K 2877.6초 → 4:48/km
    expect(trainingPace({ goalSec: 2700, base5kSec: 1380, mid5kSec: null })).toEqual({
      sec: 288,
      basis: "record",
      recLabel: "1주차 5K",
    });
  });

  it("측정이 목표보다 빠르면 목표 기준", () => {
    // 5K 20:00 → 10K 4:10/km — 목표 4:30보다 빠르다
    expect(trainingPace({ goalSec: 2700, base5kSec: 1200, mid5kSec: null })).toMatchObject({
      sec: 270,
      basis: "goal",
    });
  });

  it("6주차 측정이 있으면 그게 최근 기록이다", () => {
    expect(trainingPace({ goalSec: null, base5kSec: 1500, mid5kSec: 1380 })).toMatchObject({
      basis: "record",
      recLabel: "6주차 5K",
      sec: 288,
    });
  });

  it("목표도 기록도 없으면 null", () => {
    expect(trainingPace({ goalSec: null, base5kSec: null, mid5kSec: null })).toBeNull();
  });
});

describe("withMyPace — 문구 옆에 내 실제 페이스", () => {
  const P = 270; // 4:30

  it("P±N초 · 범위 · 맨 P", () => {
    expect(withMyPace("400m @ P-15초 → 200m 조깅 · 8회", P)).toBe("400m @ P-15초(4:15) → 200m 조깅 · 8회");
    expect(withMyPace("20분 @ P+10~15초 연속", P)).toBe("20분 @ P+10~15초(4:40~4:45) 연속");
    expect(withMyPace("800m @ P-10~15초 → 2분 조깅 · 6회", P)).toBe("800m @ P-10~15초(4:15~4:20) → 2분 조깅 · 6회");
    expect(withMyPace("2km @ P → 3분 조깅 · 3회", P)).toBe("2km @ P(4:30) → 3분 조깅 · 3회");
  });

  it("P가 없으면 문구 그대로", () => {
    expect(withMyPace("400m @ P-15초", null)).toBe("400m @ P-15초");
  });

  it("km당 초 표기", () => {
    expect(fmtPace(288)).toBe("4:48");
    expect(fmtPace(360)).toBe("6:00");
  });
});

describe("기본 훈련표", () => {
  it("13회차, 종류는 사전에 있는 코드, 1·6·13회차는 기록 측정", () => {
    expect(PB_DEFAULT_SESS_PLANS.map((p) => p.sessNo)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    for (const p of PB_DEFAULT_SESS_PLANS) expect(PB_TRN_KIND_CDS).toContain(p.kindCd);
    expect([1, 6, 13].map((n) => PB_DEFAULT_SESS_PLANS[n - 1].kindCd)).toEqual(["TT", "TT", "TT"]);
    expect(PB_TRN_KINDS.HILL.nm).toBe("업힐 훈련");
  });

  it("조사 수정안 — 11주차는 정점(3km 반복), 12주차는 테이퍼", () => {
    expect(PB_DEFAULT_SESS_PLANS[10]).toMatchObject({ kindCd: "RACE", ttl: "3km 반복" });
    expect(PB_DEFAULT_SESS_PLANS[11].kindCd).toBe("TAPER");
  });

  it("표기 — 모르는 용어 금지, 반복 훈련엔 쉬는 법, 개인 훈련은 회차마다 적혀 있다", () => {
    for (const p of PB_DEFAULT_SESS_PLANS) {
      const txt = `${p.ttl} ${p.mainTxt} ${p.easyTxt ?? ""}`;
      expect(txt).not.toMatch(/크루즈|최대산소섭취량|단계/);
      if (/·\s*\d+(~\d+)?회/.test(p.mainTxt)) expect(p.mainTxt).toMatch(/조깅|걷/);
      expect(p.selfTxt).toBeTruthy();
    }
  });
});

describe("trainingPace — 중간점검 주차는 설정값", () => {
  it("midWkNo를 바꾸면 기록 출처 문구도 따라간다", () => {
    expect(trainingPace({ goalSec: null, base5kSec: null, mid5kSec: 1380, midWkNo: 7 })?.recLabel).toBe("7주차 5K");
  });
});
