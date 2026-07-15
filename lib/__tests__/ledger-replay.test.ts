import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import {
  buildActiveIntervals,
  buildChargeMonths,
  firstChargeMonth,
  isFullyActiveMonth,
  isMonthCharged,
  replayPays,
  type ExmRuleRange,
  type PolicyRange,
} from "@/lib/dues/ledger-replay";

const POLICY: PolicyRange[] = [
  { aply_stt_dt: "2026-01-01", aply_end_dt: "2099-12-31", monthly_fee_amt: 2000 },
];

describe("firstChargeMonth", () => {
  it("컷오프(2026-07-01) 이전 가입자는 가입 당월부터 부과(기존 규칙 유지)", () => {
    expect(firstChargeMonth("2026-06-30")).toBe("2026-06-01");
    expect(firstChargeMonth("2026-06-01")).toBe("2026-06-01");
    expect(firstChargeMonth("2026-03-15")).toBe("2026-03-01");
  });

  it("컷오프 당일(2026-07-01) 가입자부터 가입 다음 달부터 부과", () => {
    expect(firstChargeMonth("2026-07-01")).toBe("2026-08-01");
  });

  it("컷오프 이후 가입자는 가입일과 무관하게 가입 다음 달부터", () => {
    expect(firstChargeMonth("2026-07-15")).toBe("2026-08-01");
    expect(firstChargeMonth("2026-07-31")).toBe("2026-08-01");
    expect(firstChargeMonth("2026-08-01")).toBe("2026-09-01");
    expect(firstChargeMonth("2026-08-31")).toBe("2026-09-01");
  });

  it("연말 가입은 다음 해 1월부터(연 경계)", () => {
    expect(firstChargeMonth("2026-12-31")).toBe("2027-01-01");
  });
});

describe("isMonthCharged", () => {
  it("첫 부과월 이후(포함)면 부과 대상", () => {
    // 2026-07-15 가입 → 첫 부과월 2026-08
    expect(isMonthCharged("2026-07-15", "2026-08")).toBe(true);
    expect(isMonthCharged("2026-07-15", "2026-09")).toBe(true);
  });

  it("첫 부과월 이전(미부과 가입월 포함)이면 대상 아님", () => {
    // 가입 당월(2026-07)은 미부과 → false
    expect(isMonthCharged("2026-07-15", "2026-07")).toBe(false);
    expect(isMonthCharged("2026-07-15", "2026-06")).toBe(false);
  });

  it("컷오프 이전 가입자는 가입 당월부터 부과 대상", () => {
    expect(isMonthCharged("2026-06-20", "2026-06")).toBe(true);
    expect(isMonthCharged("2026-06-20", "2026-05")).toBe(false);
  });

  it("join_dt 가 없으면(빈 문자열·null·undefined) 부과 판정 불가 → false — 배치·재계산과 방향 일치", () => {
    expect(isMonthCharged("", "2026-08")).toBe(false);
    expect(isMonthCharged(null, "2026-08")).toBe(false);
    expect(isMonthCharged(undefined, "2026-08")).toBe(false);
  });
});

describe("buildChargeMonths", () => {
  it("from~to 구간의 매월 정책 회비를 부과한다", () => {
    const months = buildChargeMonths(POLICY, [], "2026-05-01", "2026-07-02");
    expect(months.map((m) => m.aplyYm)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(months.reduce((s, m) => s + m.charged, 0)).toBe(6000);
  });

  it("월 중간 날짜가 들어와도 월초 기준으로 걷는다", () => {
    const months = buildChargeMonths(POLICY, [], "2026-06-15", "2026-06-20");
    expect(months.map((m) => m.aplyYm)).toEqual(["2026-06"]);
  });

  it("정책이 없는 달은 부과하지 않는다", () => {
    const policies: PolicyRange[] = [
      { aply_stt_dt: "2026-06-01", aply_end_dt: "2026-06-30", monthly_fee_amt: 2000 },
    ];
    const months = buildChargeMonths(policies, [], "2026-05-01", "2026-07-01");
    expect(months.map((m) => m.aplyYm)).toEqual(["2026-06"]);
  });

  it("여러 정책이 겹치면 나중 시작 정책을 쓴다(기존 at(-1) 규칙)", () => {
    const policies: PolicyRange[] = [
      { aply_stt_dt: "2026-01-01", aply_end_dt: "2099-12-31", monthly_fee_amt: 2000 },
      { aply_stt_dt: "2026-06-01", aply_end_dt: "2099-12-31", monthly_fee_amt: 3000 },
    ];
    const months = buildChargeMonths(policies, [], "2026-05-01", "2026-06-01");
    expect(months.find((m) => m.aplyYm === "2026-05")?.charged).toBe(2000);
    expect(months.find((m) => m.aplyYm === "2026-06")?.charged).toBe(3000);
  });

  it("full 면제는 그 달 회비 전액, partial 은 exm_amt", () => {
    const rules: ExmRuleRange[] = [
      { exm_cfg_id: "full1", exm_tp_enm: "full", exm_amt: null, aply_stt_dt: "2026-05-01", aply_end_dt: "2026-05-31" },
      { exm_cfg_id: "part1", exm_tp_enm: "partial", exm_amt: 500, aply_stt_dt: "2026-06-01", aply_end_dt: "2026-06-30" },
    ];
    const months = buildChargeMonths(POLICY, rules, "2026-05-01", "2026-07-01");
    expect(months.find((m) => m.aplyYm === "2026-05")?.exm).toEqual({ exmCfgId: "full1", exmAmt: 2000 });
    expect(months.find((m) => m.aplyYm === "2026-06")?.exm).toEqual({ exmCfgId: "part1", exmAmt: 500 });
    expect(months.find((m) => m.aplyYm === "2026-07")?.exm).toBeNull();
  });

  it("from 이 to 보다 뒤면 빈 배열", () => {
    expect(buildChargeMonths(POLICY, [], "2026-08-01", "2026-07-01")).toEqual([]);
  });
});

describe("buildActiveIntervals", () => {
  it("이력 없는 active 1건 → 첫 구간 start 열림·end null", () => {
    const iv = buildActiveIntervals([{ mem_st_cd: "active", eff_at: "2026-02-10T00:00:00+09:00" }]);
    expect(iv).toHaveLength(1);
    expect(iv[0].end).toBeNull();
    expect(dayjs(iv[0].start).year()).toBeLessThan(2000); // 가입월은 firstChargeMonth 관장 → 시작 열림
  });

  it("비활성→재활성 → active 구간 2개, 두 번째 start는 재활성 시각", () => {
    const iv = buildActiveIntervals([
      { mem_st_cd: "active", eff_at: "2026-02-10T00:00:00+09:00" },
      { mem_st_cd: "inactive", eff_at: "2026-05-12T00:00:00+09:00" },
      { mem_st_cd: "active", eff_at: "2026-11-20T00:00:00+09:00" },
    ]);
    expect(iv).toHaveLength(2);
    expect(iv[0].end).toBe("2026-05-12T00:00:00+09:00");
    expect(iv[1].start).toBe("2026-11-20T00:00:00+09:00");
    expect(iv[1].end).toBeNull();
  });

  it("정렬 안 된 입력도 eff_at 순으로 처리", () => {
    const iv = buildActiveIntervals([
      { mem_st_cd: "active", eff_at: "2026-11-20T00:00:00+09:00" },
      { mem_st_cd: "active", eff_at: "2026-02-10T00:00:00+09:00" },
      { mem_st_cd: "inactive", eff_at: "2026-05-12T00:00:00+09:00" },
    ]);
    expect(iv[0].end).toBe("2026-05-12T00:00:00+09:00");
  });

  it("레거시: 첫 세그먼트가 inactive면 뒤의 active(재활성)는 열지 않고 실제 eff_at 사용", () => {
    // 도입 전 in-place 비활성된 회원(정본 inactive, eff_at=가입일 백필) → 재활성
    const iv = buildActiveIntervals([
      { mem_st_cd: "inactive", eff_at: "2026-02-10T00:00:00+09:00" }, // 백필된 정본
      { mem_st_cd: "active", eff_at: "2026-11-20T00:00:00+09:00" }, // 재활성
    ]);
    expect(iv).toHaveLength(1);
    expect(iv[0].start).toBe("2026-11-20T00:00:00+09:00"); // 열리지 않음
    expect(iv[0].end).toBeNull();
  });

  it("레거시 재활성: 비활성 기간(가입~재활성 전)은 부과 대상 아님", () => {
    const iv = buildActiveIntervals([
      { mem_st_cd: "inactive", eff_at: "2026-02-10T00:00:00+09:00" },
      { mem_st_cd: "active", eff_at: "2026-11-20T00:00:00+09:00" },
    ]);
    expect(isFullyActiveMonth(iv, "2026-05")).toBe(false); // 비활성 기간
    expect(isFullyActiveMonth(iv, "2026-11")).toBe(false); // 재활성월
    expect(isFullyActiveMonth(iv, "2026-12")).toBe(true); // 복귀 후 첫 온전한 달
  });
});

describe("isFullyActiveMonth", () => {
  const iv = buildActiveIntervals([
    { mem_st_cd: "active", eff_at: "2026-02-10T00:00:00+09:00" },
    { mem_st_cd: "inactive", eff_at: "2026-05-12T00:00:00+09:00" },
    { mem_st_cd: "active", eff_at: "2026-11-20T00:00:00+09:00" },
  ]);

  it("온전히 active인 달은 부과 대상(true)", () => {
    expect(isFullyActiveMonth(iv, "2026-03")).toBe(true);
    expect(isFullyActiveMonth(iv, "2026-04")).toBe(true);
    expect(isFullyActiveMonth(iv, "2026-12")).toBe(true); // 복귀 후 첫 온전한 달
  });

  it("자격 변동 걸친 달·비활성 달은 면제(false)", () => {
    expect(isFullyActiveMonth(iv, "2026-05")).toBe(false); // 5/12 비활성 시작
    expect(isFullyActiveMonth(iv, "2026-06")).toBe(false); // 온전 비활성
    expect(isFullyActiveMonth(iv, "2026-10")).toBe(false);
    expect(isFullyActiveMonth(iv, "2026-11")).toBe(false); // 11/20 재활성
  });

  it("가입월은 시작이 열려 있어 true(부과 여부는 firstChargeMonth가 별도 결정)", () => {
    expect(isFullyActiveMonth(iv, "2026-02")).toBe(true);
  });
});

describe("buildChargeMonths + activeIntervals (온전한 달만 부과)", () => {
  it("§3 시나리오: 5/12 비활성 → 11/20 재활성 → 5~11월 면제, 12월 부과", () => {
    const iv = buildActiveIntervals([
      { mem_st_cd: "active", eff_at: "2026-02-10T00:00:00+09:00" },
      { mem_st_cd: "inactive", eff_at: "2026-05-12T00:00:00+09:00" },
      { mem_st_cd: "active", eff_at: "2026-11-20T00:00:00+09:00" },
    ]);
    const ym = buildChargeMonths(POLICY, [], "2026-02-01", "2026-12-01", iv).map((m) => m.aplyYm);
    expect(ym).toEqual(["2026-02", "2026-03", "2026-04", "2026-12"]);
  });

  it("activeIntervals 미제공이면 전 구간 부과(기존 동작 유지)", () => {
    const ym = buildChargeMonths(POLICY, [], "2026-05-01", "2026-07-01").map((m) => m.aplyYm);
    expect(ym).toEqual(["2026-05", "2026-06", "2026-07"]);
  });
});

describe("replayPays", () => {
  const pays = [
    { payId: "p1", payAmt: 2000, txnAt: "2026-06-01T10:00:00+09:00", fromBankTxn: true },
    { payId: "p2", payAmt: 10000, txnAt: "2026-06-10T09:30:00+09:00", fromBankTxn: true },
    { payId: "p3", payAmt: 4000, txnAt: "2026-06-05T12:00:00+09:00", fromBankTxn: true },
  ];

  it("앵커가 없으면 전부 합산하고 커서는 마지막 거래 +1초", () => {
    const r = replayPays(pays, null);
    expect(r.totalPaid).toBe(16000);
    expect(r.lastPayId).toBe("p2");
    expect(r.lastTxnAt).toBe("2026-06-10T00:30:01.000Z"); // 09:30 KST +1s = 00:30:01 UTC
  });

  it("앵커 커서 이후의 납부만 합산한다(경계=커서와 같으면 제외)", () => {
    const r = replayPays(pays, "2026-06-05T12:00:00+09:00");
    expect(r.totalPaid).toBe(10000);
    expect(r.lastPayId).toBe("p2");
  });

  it("리플레이 대상이 없으면 커서 null — 호출측이 앵커 커서를 유지한다", () => {
    const r = replayPays(pays, "2026-07-01T00:00:00+09:00");
    expect(r).toEqual({ totalPaid: 0, lastTxnAt: null, lastPayId: null });
  });

  it("납부 취소 후(목록에서 빠짐) 재실행하면 그만큼 줄어든 합이 나온다(멱등)", () => {
    const afterCancel = pays.filter((p) => p.payId !== "p2");
    expect(replayPays(afterCancel, null).totalPaid).toBe(6000);
    expect(replayPays(afterCancel, null).lastPayId).toBe("p3");
  });

  it("수동 납부(은행거래 미연결)는 합산에는 들어가지만 커서를 밀지 않는다", () => {
    const withManual = [
      ...pays,
      { payId: "m1", payAmt: 3000, txnAt: "2026-06-25T00:00:00+09:00", fromBankTxn: false },
    ];
    const r = replayPays(withManual, null);
    expect(r.totalPaid).toBe(19000); // 수동분 포함
    expect(r.lastPayId).toBe("p2"); // 커서는 마지막 '은행' 거래(06-10) — 06-25 수동납부가 밀면
    // 그보다 앞선 실제 은행 입금이 늦게 업로드될 때 컷오프에 걸려 소실된다
  });

  it("은행 거래가 하나도 없으면 커서는 null — 호출측이 앵커 커서/가입월로 폴백", () => {
    const onlyManual = [{ payId: "m1", payAmt: 3000, txnAt: "2026-06-25T00:00:00+09:00", fromBankTxn: false }];
    const r = replayPays(onlyManual, null);
    expect(r.totalPaid).toBe(3000);
    expect(r.lastTxnAt).toBeNull();
    expect(r.lastPayId).toBeNull();
  });
});
