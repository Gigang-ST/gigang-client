import { describe, expect, it } from "vitest";

import {
  BATCH_CHANGES_LIMIT,
  capChanges,
  metricDeltas,
  parseStoredBatchResult,
} from "@/lib/batch/types";

describe("parseStoredBatchResult — jsonb는 무엇이든 들어온다", () => {
  it("정상 결과를 그대로 좁힌다", () => {
    const parsed = parseStoredBatchResult({
      metrics: { 대상: 34, 부여: 5 },
      changes: [{ memNm: "홍길동", what: "7월 회비 감면 2,000원" }],
      warnings: ["시즌이 둘이라 각각 돌렸습니다"],
    });
    expect(parsed).toEqual({
      metrics: { 대상: 34, 부여: 5 },
      changes: [{ memNm: "홍길동", what: "7월 회비 감면 2,000원" }],
      warnings: ["시즌이 둘이라 각각 돌렸습니다"],
    });
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
    const parsed = parseStoredBatchResult({ metrics: { 대상: 3, 이상한거: "많음", nan: NaN } });
    expect(parsed?.metrics).toEqual({ 대상: 3 });
  });

  it("모양이 안 맞는 change는 버린다", () => {
    const parsed = parseStoredBatchResult({
      changes: [{ memNm: "홍길동", what: "감면" }, { memNm: 1 }, null, "x"],
    });
    expect(parsed?.changes).toEqual([{ memNm: "홍길동", what: "감면" }]);
  });

  it("건질 게 하나도 없으면 null — 빈 칩·빈 목록을 그리지 않는다", () => {
    expect(parseStoredBatchResult({ metrics: {}, changes: [], warnings: [] })).toBeNull();
    expect(parseStoredBatchResult({ 엉뚱: 1 })).toBeNull();
  });
});

describe("metricDeltas — 직전 성공 대비 증감", () => {
  it("늘고 준 것만 남긴다(변화 없는 키는 안 그린다)", () => {
    expect(metricDeltas({ 대상: 34, 부여: 5 }, { 대상: 34, 부여: 3 })).toEqual({ 부여: 2 });
  });

  it("감면이 5명 → 0명이면 음수로 잡힌다 — 이상 징후가 숫자 하나로 보인다", () => {
    expect(metricDeltas({ 부여: 0 }, { 부여: 5 })).toEqual({ 부여: -5 });
  });

  it("이전 실행에 없던 키는 비교하지 않는다", () => {
    // 0에서 늘어난 것처럼 보이면 오히려 오해를 만든다
    expect(metricDeltas({ 신규지표: 7 }, { 대상: 1 })).toEqual({});
  });

  it("이전 실행이 없으면 증감도 없다(첫 실행)", () => {
    expect(metricDeltas({ 부여: 5 }, null)).toEqual({});
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
