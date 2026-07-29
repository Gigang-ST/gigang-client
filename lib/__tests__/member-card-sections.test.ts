import { describe, expect, it } from "vitest";

import {
  buildPbRows,
  getRecordCodeLabel,
  getRunningProfileSlots,
  hasPaceTrend,
  pbEmptyValue,
} from "@/lib/member-card";

import type {
  MemberCardRaceRecord,
  MemberCardRecord,
} from "@/lib/queries/member-card";

/**
 * 프로필 카드 섹션 규칙 회귀 테스트.
 *
 * 카드는 **두 화면**(내 프로필탭 = 편집판 / 팝업 = 공개판)이 한 컴포넌트를 공유하고,
 * 빈 상태 규칙이 성격에 따라 셋으로 갈린다. 이 규칙들은 화면을 열어 보지 않으면
 * 어긋난 걸 알기 어려워(빈 칸이 하나 더 뜨거나 덜 떠도 크래시가 없다) 여기 못박아 둔다.
 */

function road(evt: string, sec: number, raceDt: string | null = null): MemberCardRecord {
  return { sport: "road_run", evt, rec_time_sec: sec, race_nm: "테스트대회", race_dt: raceDt };
}

function pace(evt: string, dt: string): MemberCardRaceRecord {
  return { evt, rec_time_sec: 3600, race_nm: "테스트대회", race_dt: dt };
}

describe("getRecordCodeLabel — 기록 목록은 코드 표기", () => {
  it("로드런은 거리 코드를 대문자로 쓴다 (페이스 차트 범례와 같은 어휘)", () => {
    expect(getRecordCodeLabel(road("FULL", 1))).toBe("FULL");
    expect(getRecordCodeLabel(road("half", 1))).toBe("HALF");
    expect(getRecordCodeLabel(road("10k", 1))).toBe("10K");
  });

  it("철인3종·사이클은 거리 규격이 아니라 종목 이름이라 한글을 유지한다", () => {
    expect(
      getRecordCodeLabel({ sport: "triathlon", evt: "", rec_time_sec: 1, race_nm: null, race_dt: null }),
    ).toBe("철인3종");
    expect(
      getRecordCodeLabel({ sport: "cycling", evt: "", rec_time_sec: 1, race_nm: null, race_dt: null }),
    ).toBe("사이클");
  });
});

describe("buildPbRows — 기록 칸은 늘 같은 골격", () => {
  it("기록이 하나도 없어도 FULL/HALF/10K/UTMB 네 줄이 선다", () => {
    const rows = buildPbRows([], null);
    expect(rows.map((r) => r.label)).toEqual(["FULL", "HALF", "10K", "UTMB INDEX"]);
    expect(rows.every((r) => r.value === null)).toBe(true);
    // 안 켜진 줄은 종목 점도 회색이어야 "채워야 할 칸"으로 읽힌다
    expect(rows.every((r) => r.dotCls === "bg-border")).toBe(true);
  });

  it("빈 칸 표기는 시간과 인덱스를 구분한다 — UTMB는 자릿수를 흉내 내지 않는다", () => {
    const rows = buildPbRows([], null);
    expect(pbEmptyValue(rows[0])).toBe("--:--");
    expect(pbEmptyValue(rows[3])).toBe("--");
  });

  it("있는 기록만 값이 채워지고 나머지 칸은 그대로 남는다", () => {
    const rows = buildPbRows([road("FULL", 13331)], null);
    expect(rows[0].value).toBe("3:42:11");
    expect(rows[0].dotCls).not.toBe("bg-border");
    expect(rows[1].value).toBeNull();
    expect(rows[2].value).toBeNull();
  });

  it("UTMB는 연동됐을 때만 값이 선다", () => {
    expect(buildPbRows([], 542).at(-1)).toMatchObject({
      label: "UTMB INDEX",
      value: "542",
      isUtmb: true,
    });
    expect(buildPbRows([], null).at(-1)).toMatchObject({ value: null, isUtmb: true });
  });

  it("철인3종·사이클은 **있을 때만** 붙는다 — 로드 러너 카드에 안 켜진 철인 칸을 세우지 않는다", () => {
    const withTri = buildPbRows(
      [{ sport: "triathlon", evt: "OLYMPIC", rec_time_sec: 9000, race_nm: null, race_dt: null }],
      null,
    );
    expect(withTri.map((r) => r.label)).toEqual([
      "FULL",
      "HALF",
      "10K",
      "철인3종",
      "UTMB INDEX",
    ]);
    // 로드 기록만 있으면 철인 칸은 아예 없다
    expect(buildPbRows([road("10K", 2550)], null).map((r) => r.label)).toEqual([
      "FULL",
      "HALF",
      "10K",
      "UTMB INDEX",
    ]);
  });
});

describe("hasPaceTrend — 선이 그어지려면 점이 둘", () => {
  it("기록이 없거나 payload가 없으면 섹션째 빠진다", () => {
    expect(hasPaceTrend(undefined)).toBe(false); // 구버전 RPC(배포 스큐)
    expect(hasPaceTrend([])).toBe(false);
  });

  it("한 건짜리는 추이가 아니다", () => {
    expect(hasPaceTrend([pace("FULL", "2026-03-01")])).toBe(false);
  });

  it("서로 다른 종목이 한 건씩이면 어느 선도 못 긋는다", () => {
    expect(
      hasPaceTrend([pace("FULL", "2026-03-01"), pace("10K", "2026-04-01")]),
    ).toBe(false);
  });

  it("같은 종목이 두 건이면 그린다", () => {
    expect(
      hasPaceTrend([pace("10K", "2026-03-01"), pace("10K", "2026-04-01")]),
    ).toBe(true);
  });
});

describe("getRunningProfileSlots — 미입력도 자리를 지킨다", () => {
  it("프로필 자체가 없어도 세 칸이 모두 온다(편집판이 `—`를 찍는다)", () => {
    const slots = getRunningProfileSlots(null);
    expect(slots.map((s) => s.label)).toEqual(["평균 페이스", "평균 거리", "가까운 역"]);
    expect(slots.every((s) => s.value === null)).toBe(true);
  });

  it("일부만 채우면 그 칸만 값이 있다", () => {
    const slots = getRunningProfileSlots({
      avg_pace_cd: "P530",
      avg_run_dist_km: null,
      near_stn_nm: "합정",
    });
    expect(slots[0].value).toBe("5'30\"");
    expect(slots[1].value).toBeNull();
    expect(slots[2].value).toBe("합정역"); // "역"을 중복해서 붙이지 않는다
  });

  it("UNKNOWN(잘 모르겠어요)은 정보가 없는 것과 같게 본다", () => {
    const slots = getRunningProfileSlots({
      avg_pace_cd: "UNKNOWN",
      avg_run_dist_km: 0,
      near_stn_nm: "  ",
    });
    expect(slots.every((s) => s.value === null)).toBe(true);
  });
});
