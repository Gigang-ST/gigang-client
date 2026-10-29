import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import {
  attdWindowStartISO,
  buildJoinConditions,
  exemptionLabel,
  hasJoinCondition,
  joinConditionErrorMessage,
  joinConditionLabel,
  NO_JOIN_CONDITION,
} from "@/lib/gathering/join-condition";

const KST = "Asia/Seoul";

describe("hasJoinCondition", () => {
  it("두 값이 다 있으면 조건 있음", () => {
    expect(hasJoinCondition({ req_attd_cnt: 6, req_attd_months: 6 })).toBe(true);
  });

  it("둘 다 없으면 조건 없음", () => {
    expect(hasJoinCondition({ req_attd_cnt: null, req_attd_months: null })).toBe(false);
  });

  // 기간은 선택이다 — 비우면 전체 기간(가입 이후 누적)으로 센다.
  it("횟수만 있어도 조건이다 (기간 = 전체)", () => {
    expect(hasJoinCondition({ req_attd_cnt: 6, req_attd_months: null })).toBe(true);
  });

  // 기간만으로는 판정할 대상이 없다. DB CHECK 도 같은 조합을 막지만 읽는 쪽도 방어한다.
  it("기간만 있으면 조건 없음으로 본다", () => {
    expect(hasJoinCondition({ req_attd_cnt: null, req_attd_months: 6 })).toBe(false);
  });

  // 실제로 이 함수를 배선한 직후 뚫렸다: `!== null` 이면 undefined 가 "조건 있음"으로 통과해
  // "최근 undefined개월 ... undefined회 이상"이 만들어지고, 조건 없는 모임의 참석이 통째로 막힌다.
  // 새 컬럼을 안 실은 select 나 부분 객체가 undefined 를 주므로 실제로 일어나는 입력이다.
  it("undefined 도 조건 없음이다 (null 만 보면 안 된다)", () => {
    expect(
      hasJoinCondition({ req_attd_cnt: undefined, req_attd_months: undefined } as never),
    ).toBe(false);
    expect(hasJoinCondition({ req_attd_cnt: undefined, req_attd_months: 6 } as never)).toBe(false);
  });

  it("undefined 스펙은 조회 없이 통과 처리된다", () => {
    const r = buildJoinConditions(
      { req_attd_cnt: undefined, req_attd_months: undefined } as never,
      { attdCnt: 0 },
    );
    expect(r.ok).toBe(true);
    expect(r.conditions).toHaveLength(0);
  });
});

describe("buildJoinConditions", () => {
  const spec = { req_attd_cnt: 6, req_attd_months: 6 };

  it("조건 없는 모임은 조회 없이 통과", () => {
    const r = buildJoinConditions({ req_attd_cnt: null, req_attd_months: null }, { attdCnt: 0 });
    expect(r).toEqual(NO_JOIN_CONDITION);
    expect(r.conditions).toHaveLength(0);
    expect(r.ok).toBe(true);
  });

  // 경계 — "6회 이상"이므로 정확히 6회는 통과다. 여기가 틀리면 한 명씩 억울해진다.
  it("정확히 필요 횟수면 통과", () => {
    expect(buildJoinConditions(spec, { attdCnt: 6 }).ok).toBe(true);
  });

  it("한 번 모자라면 미달", () => {
    expect(buildJoinConditions(spec, { attdCnt: 5 }).ok).toBe(false);
  });

  it("넘치면 통과", () => {
    expect(buildJoinConditions(spec, { attdCnt: 20 }).ok).toBe(true);
  });

  it("화면 문구를 조건 설정 그대로 조립한다", () => {
    const r = buildJoinConditions({ req_attd_cnt: 3, req_attd_months: 12 }, { attdCnt: 1 });
    expect(r.conditions[0]).toEqual({
      cd: "attd_cnt",
      label: "최근 12개월 모임 참석 3회 이상",
      met: false,
      current: "현재 1회",
    });
  });

  // 미달이어도 현재 횟수를 준다 — 화면이 "얼마나 남았는지"를 말할 수 있어야 한다.
  it("미달이어도 현재 상태를 함께 돌려준다", () => {
    expect(buildJoinConditions(spec, { attdCnt: 0 }).conditions[0].current).toBe("현재 0회");
  });
});

describe("기간 없는 조건 (전체 기간)", () => {
  const spec = { req_attd_cnt: 3, req_attd_months: null };

  it("문구에서 기간 얘기를 뺀다", () => {
    const r = buildJoinConditions(spec, { attdCnt: 1 });
    expect(r.conditions[0].label).toBe("모임 참석 3회 이상");
    expect(r.conditions[0].current).toBe("현재 1회");
    expect(r.ok).toBe(false);
  });

  it("누적 횟수가 채워지면 통과", () => {
    expect(buildJoinConditions(spec, { attdCnt: 3 }).ok).toBe(true);
  });

  it("joinConditionLabel 도 같은 문구를 만든다 (화면·서버가 갈리지 않게)", () => {
    expect(joinConditionLabel(null, 3)).toBe("모임 참석 3회 이상");
    expect(joinConditionLabel(6, 6)).toBe("최근 6개월 모임 참석 6회 이상");
  });
});

// 2026 송년회 — "최근 6개월 6회 이상 **또는** 동계훈련 승인 참가자".
describe("면제 프로젝트 (OR)", () => {
  const spec = { req_attd_cnt: 6, req_attd_months: 6, exm_evt_id: "evt-1" };
  const evtNm = "동계훈련 10K PB클래스 3기";
  const approved = { evtNm, joined: true, approved: true };
  const pendingPay = { evtNm, joined: true, approved: false };
  const outsider = { evtNm, joined: false, approved: false };

  it("횟수가 모자라도 승인 참가자면 통과", () => {
    const r = buildJoinConditions(spec, { attdCnt: 2, exemption: approved });
    expect(r.ok).toBe(true);
    expect(r.conditions.map((c) => [c.cd, c.met])).toEqual([
      ["attd_cnt", false],
      ["evt_prt", true],
    ]);
  });

  it("참가자가 아니어도 횟수를 채우면 통과", () => {
    expect(buildJoinConditions(spec, { attdCnt: 6, exemption: outsider }).ok).toBe(true);
  });

  it("둘 다 못 채우면 미달", () => {
    expect(buildJoinConditions(spec, { attdCnt: 5, exemption: outsider }).ok).toBe(false);
  });

  // 승인은 운영진의 입금 확인이다. 신청만 한 사람까지 열면 승인제의 뜻이 사라진다.
  it("신청만 하고 승인 전이면 면제되지 않는다", () => {
    const r = buildJoinConditions(spec, { attdCnt: 0, exemption: pendingPay });
    expect(r.ok).toBe(false);
    expect(r.conditions[1]).toEqual({
      cd: "evt_prt",
      label: "동계훈련 10K PB클래스 3기 참가자",
      met: false,
      current: "입금 확인 전",
    });
  });

  it("신청조차 안 했으면 상태를 덧붙이지 않는다", () => {
    expect(buildJoinConditions(spec, { attdCnt: 0, exemption: outsider }).conditions[1].current).toBeNull();
  });

  // 프로젝트를 못 찾았거나 다른 팀이면 exemption 이 안 온다 — 원래 조건 하나로 판정한다.
  it("면제 상태가 없으면 참석 횟수 조건만 남는다", () => {
    const r = buildJoinConditions(spec, { attdCnt: 2, exemption: null });
    expect(r.ok).toBe(false);
    expect(r.conditions).toHaveLength(1);
  });

  // 면제는 횟수 조건에 딸린 값이다. 횟수가 없으면 애초에 조건이 없는 모임이다.
  it("횟수 조건이 없으면 면제를 걸어도 조건 없음", () => {
    const r = buildJoinConditions(
      { req_attd_cnt: null, req_attd_months: null, exm_evt_id: "evt-1" },
      { attdCnt: 0, exemption: outsider },
    );
    expect(r).toEqual(NO_JOIN_CONDITION);
  });

  it("문구는 프로젝트 이름에 '참가자'를 붙인다", () => {
    expect(exemptionLabel(evtNm)).toBe("동계훈련 10K PB클래스 3기 참가자");
  });

  // 줄마다 "~이어야 참여할 수 있어요"를 붙이면 둘 다 채워야 하는 것처럼 읽힌다.
  it("미달 안내는 '또는'으로 한 문장에 잇는다", () => {
    const r = buildJoinConditions(spec, { attdCnt: 4, exemption: pendingPay });
    expect(joinConditionErrorMessage(r)).toBe(
      "최근 6개월 모임 참석 6회 이상 또는 동계훈련 10K PB클래스 3기 참가자여야 참여할 수 있어요. (현재 4회 · 입금 확인 전)",
    );
  });

  it("조건이 하나면 안내도 예전 그대로다", () => {
    const r = buildJoinConditions({ req_attd_cnt: 6, req_attd_months: 6 }, { attdCnt: 4 });
    expect(joinConditionErrorMessage(r)).toBe(
      "최근 6개월 모임 참석 6회 이상이어야 참여할 수 있어요. (현재 4회)",
    );
  });
});

describe("attdWindowStartISO", () => {
  it("KST 기준 N개월 전 자정을 돌려준다", () => {
    const now = dayjs.tz("2026-08-25 14:30", KST);
    // 2026-02-25 00:00 KST = 2026-02-24T15:00:00Z
    expect(attdWindowStartISO(6, now)).toBe("2026-02-24T15:00:00.000Z");
  });

  // 배포처가 UTC 라 KST 00~09시가 위험 구간이다. 이 시각의 "오늘"이 UTC 기준으론 어제라,
  // KST 고정이 없으면 구간 시작이 하루 밀려 같은 사람이 새벽엔 떨어지고 아침엔 붙는다.
  it("KST 새벽에도 구간 시작이 하루 밀리지 않는다", () => {
    const dawn = dayjs.tz("2026-08-25 01:00", KST);
    const noon = dayjs.tz("2026-08-25 12:00", KST);
    expect(attdWindowStartISO(6, dawn)).toBe(attdWindowStartISO(6, noon));
  });

  it("구간 시작은 그날의 KST 자정이다", () => {
    const now = dayjs.tz("2026-08-25 23:59", KST);
    expect(dayjs(attdWindowStartISO(1, now)).tz(KST).format("YYYY-MM-DD HH:mm")).toBe(
      "2026-07-25 00:00",
    );
  });

  // 말일 → 짧은 달. dayjs 는 클램프한다(3/31 - 1개월 = 2/28). 조용히 이상해지지 않게 못박는다.
  it("말일에서 짧은 달로 갈 땐 그 달 말일로 클램프된다", () => {
    const now = dayjs.tz("2026-03-31 09:00", KST);
    expect(dayjs(attdWindowStartISO(1, now)).tz(KST).format("YYYY-MM-DD")).toBe("2026-02-28");
  });
});
