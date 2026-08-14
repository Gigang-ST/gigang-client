import { describe, expect, it } from "vitest";

import {
  BATCH_CHANGES_LIMIT,
  capChanges,
  didChange,
  findComparableRun,
  metricDeltas,
  parseStoredBatchResult,
} from "@/lib/batch/types";

describe("parseStoredBatchResult — jsonb는 무엇이든 들어온다", () => {
  it("정상 결과를 그대로 좁힌다", () => {
    const parsed = parseStoredBatchResult({
      metrics: [{ label: "대상", value: 34 }, { label: "부여", value: 5 }],
      changedCount: 5,
      changes: [{ memNm: "홍길동", what: "7월 회비 감면 2,000원" }],
      warnings: ["시즌이 둘이라 각각 돌렸습니다"],
    });
    expect(parsed).toEqual({
      metrics: [{ label: "대상", value: 34 }, { label: "부여", value: 5 }],
      changedCount: 5,
      changes: [{ memNm: "홍길동", what: "7월 회비 감면 2,000원" }],
      warnings: ["시즌이 둘이라 각각 돌렸습니다"],
    });
  });

  it("⚠️ 지표 순서를 보존한다 — jsonb 객체였을 땐 Postgres가 키를 정렬해 뒤섞었다", () => {
    // 시즌·평가·부여로 넣은 게 화면에 부여·시즌·평가로 나왔던 버그.
    const parsed = parseStoredBatchResult({
      metrics: [
        { label: "시즌", value: 1 },
        { label: "평가", value: 14 },
        { label: "부여", value: 3 },
      ],
      changedCount: 3,
    });
    expect(parsed?.metrics.map((m) => m.label)).toEqual(["시즌", "평가", "부여"]);
  });

  it("배열로 바꾸기 전 쌓인 객체 형태도 값은 읽어 준다", () => {
    const parsed = parseStoredBatchResult({ metrics: { 부여: 3, 시즌: 1 } });
    expect(parsed?.metrics).toHaveLength(2);
    expect(parsed?.changedCount).toBeNull();
  });

  it("⚠️ 옛 이력은 result_json이 null이다 — 화면이 터지면 안 된다", () => {
    expect(parseStoredBatchResult(null)).toBeNull();
    expect(parseStoredBatchResult(undefined)).toBeNull();
  });

  it("배열·문자열 같은 엉뚱한 값도 null로 떨어진다", () => {
    expect(parseStoredBatchResult([1, 2, 3])).toBeNull();
    expect(parseStoredBatchResult("wat")).toBeNull();
    expect(parseStoredBatchResult(42)).toBeNull();
  });

  it("숫자가 아닌 metric은 버린다(문자열 지표가 섞여 들어와도 렌더가 안 깨진다)", () => {
    const parsed = parseStoredBatchResult({
      metrics: [
        { label: "대상", value: 3 },
        { label: "이상한거", value: "많음" },
        { label: "nan", value: NaN },
        { nope: 1 },
      ],
    });
    expect(parsed?.metrics).toEqual([{ label: "대상", value: 3 }]);
  });

  it("모양이 안 맞는 change는 버린다", () => {
    const parsed = parseStoredBatchResult({
      changes: [{ memNm: "홍길동", what: "감면" }, { memNm: 1 }, null, "x"],
    });
    expect(parsed?.changes).toEqual([{ memNm: "홍길동", what: "감면" }]);
  });

  it("건질 게 하나도 없으면 null — 빈 칩·빈 목록을 그리지 않는다", () => {
    expect(parseStoredBatchResult({ metrics: [], changes: [], warnings: [] })).toBeNull();
    expect(parseStoredBatchResult({ 엉뚱: 1 })).toBeNull();
  });
});

describe("didChange — '변화 없음' 판정", () => {
  const base = { metrics: [], changes: [], warnings: [] };

  it("⚠️ changes가 비어도 changedCount가 있으면 변화다", () => {
    // 실제 버그: 마일리지런이 칭호 3개를 부여했는데 changes를 안 채워
    // 화면에 "변화 없음"으로 나왔다. changes 길이로 추측하면 안 된다.
    expect(didChange({ ...base, changedCount: 3 })).toBe(true);
  });

  it("changedCount가 0이면 변화 없음", () => {
    expect(didChange({ ...base, changedCount: 0 })).toBe(false);
  });

  it("옛 이력(changedCount 없음)은 changes 길이로 폴백한다", () => {
    expect(didChange({ ...base, changedCount: null })).toBe(false);
    expect(
      didChange({ ...base, changedCount: null, changes: [{ memNm: "a", what: "x" }] }),
    ).toBe(true);
  });
});

describe("findComparableRun — 비교 상대 고르기", () => {
  const run = (base_month: string, granted: number) => ({
    param_json: { base_month },
    result_json: { metrics: [{ label: "부여", value: granted }], changedCount: granted },
  });

  it("⚠️ 같은 파라미터 재실행은 건너뛴다 — 그게 ▼3 노이즈의 원인이었다", () => {
    // 2026-07을 두 번 돌리면 두 번째는 이미 부여돼 0이다. 첫 실행과 비교하면
    // ▼3이 뜨는데, 그건 이상 징후가 아니라 정상 동작이다.
    const current = run("2026-07", 0);
    const older = [run("2026-07", 3), run("2026-06", 5)];
    expect(findComparableRun(current, older)?.metrics).toEqual([{ label: "부여", value: 5 }]);
  });

  it("파라미터가 다른 가장 가까운 회차를 고른다(지난달)", () => {
    const current = run("2026-08", 2);
    expect(findComparableRun(current, [run("2026-07", 3), run("2026-06", 9)])?.metrics).toEqual([
      { label: "부여", value: 3 },
    ]);
  });

  it("결과가 없는(옛) 이력은 건너뛰고 더 뒤에서 찾는다", () => {
    const current = run("2026-08", 2);
    const older = [{ param_json: { base_month: "2026-07" }, result_json: null }, run("2026-06", 9)];
    expect(findComparableRun(current, older)?.metrics).toEqual([{ label: "부여", value: 9 }]);
  });

  it("비교할 회차가 없으면 null — 첫 실행엔 증감을 안 그린다", () => {
    expect(findComparableRun(run("2026-07", 3), [run("2026-07", 1)])).toBeNull();
    expect(findComparableRun(run("2026-07", 3), [])).toBeNull();
  });

  it("파라미터가 없는 배치끼리는 같은 회차로 본다(증감 없음)", () => {
    const current = { param_json: null, result_json: { changedCount: 1 } };
    const older = [{ param_json: null, result_json: { changedCount: 5 } }];
    expect(findComparableRun(current, older)).toBeNull();
  });
});

describe("metricDeltas — 지난 회차 대비 증감", () => {
  const m = (o: Record<string, number>) =>
    Object.entries(o).map(([label, value]) => ({ label, value }));

  it("늘고 준 것만 남긴다(변화 없는 라벨은 안 그린다)", () => {
    expect(metricDeltas(m({ 대상: 34, 부여: 5 }), m({ 대상: 34, 부여: 3 }))).toEqual({ 부여: 2 });
  });

  it("감면이 5명 → 0명이면 음수로 잡힌다 — 이상 징후가 숫자 하나로 보인다", () => {
    expect(metricDeltas(m({ 부여: 0 }), m({ 부여: 5 }))).toEqual({ 부여: -5 });
  });

  it("이전 실행에 없던 라벨은 비교하지 않는다", () => {
    // 0에서 늘어난 것처럼 보이면 오히려 오해를 만든다
    expect(metricDeltas(m({ 신규지표: 7 }), m({ 대상: 1 }))).toEqual({});
  });

  it("이전 실행이 없으면 증감도 없다(첫 실행)", () => {
    expect(metricDeltas(m({ 부여: 5 }), null)).toEqual({});
  });
});

describe("capChanges — 상한", () => {
  it("상한 이하면 그대로", () => {
    const changes = [{ memNm: "a", what: "x" }];
    expect(capChanges(changes).changes).toHaveLength(1);
    expect(capChanges(changes).warnings).toHaveLength(0);
  });

  it("넘으면 자르고 경고를 남긴다 — 조용히 truncate하지 않는다", () => {
    const changes = Array.from({ length: BATCH_CHANGES_LIMIT + 5 }, (_, i) => ({
      memNm: `m${i}`,
      what: "x",
    }));
    const capped = capChanges(changes);
    expect(capped.changes).toHaveLength(BATCH_CHANGES_LIMIT);
    expect(capped.warnings[0]).toContain(`${BATCH_CHANGES_LIMIT}건만 기록`);
  });

  it("기존 경고를 지우지 않는다", () => {
    const changes = Array.from({ length: BATCH_CHANGES_LIMIT + 1 }, () => ({ memNm: "a", what: "x" }));
    expect(capChanges(changes, ["기존 경고"]).warnings).toHaveLength(2);
  });
});
