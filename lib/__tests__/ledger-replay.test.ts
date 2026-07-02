import { describe, expect, it } from "vitest";

import {
  buildChargeMonths,
  replayPays,
  type ExmRuleRange,
  type PolicyRange,
} from "@/lib/dues/ledger-replay";

const POLICY: PolicyRange[] = [
  { aply_stt_dt: "2026-01-01", aply_end_dt: "2099-12-31", monthly_fee_amt: 2000 },
];

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
