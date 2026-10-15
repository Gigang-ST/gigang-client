import { describe, expect, it } from "vitest";

import {
  getMemberStatusSince,
  type MemberStatusRow,
} from "@/lib/member-status-since";

/**
 * 회원 상태 이력 → "지금 상태가 언제 시작됐나" 판정 회귀 테스트.
 *
 * 핵심 함정 셋을 못박는다.
 *  ① 정본(vers=0)의 `eff_at` 은 **역할 변경에도 갱신된다** — 비활성 중에 관리자 지정만
 *    바꿔도 날짜가 당겨지므로, 같은 상태가 이어지는 이력을 거슬러 올라가야 한다.
 *  ② 삭제 경계(`del_yn=true`)를 넘어가면 **이전 소속 에피소드**의 날짜를 집어온다.
 *  ③ 2026-07-15 이관 때 한꺼번에 탈퇴로 바뀐 사람들은 `eff_at` 이 이관 시각이라
 *    탈퇴는 `leave_dt` 를 먼저 봐야 한다.
 */

/** 이력 행 한 줄 — 테스트에서 읽기 쉽게 묶는다. */
function row(
  vers: number,
  status: string,
  effAt: string,
  extra?: { delYn?: boolean; leaveDt?: string | null },
): MemberStatusRow {
  return {
    vers,
    mem_st_cd: status,
    eff_at: effAt,
    del_yn: extra?.delYn ?? false,
    leave_dt: extra?.leaveDt ?? null,
  };
}

describe("getMemberStatusSince", () => {
  it("활성 회원은 표시할 전환일이 없다", () => {
    const rows = [row(0, "active", "2026-01-10T00:00:00Z")];
    expect(getMemberStatusSince(rows, "2026-10-15")).toBeNull();
  });

  it("정본(vers=0)이 없는 삭제 회원은 null", () => {
    // 삭제는 정본을 vers>0 · del_yn=true 로 밀어 슬롯을 비운다.
    const rows = [
      row(1, "active", "2026-01-10T00:00:00Z"),
      row(2, "active", "2026-03-01T00:00:00Z", { delYn: true }),
    ];
    expect(getMemberStatusSince(rows, "2026-10-15")).toBeNull();
  });

  it("비활성 전환 시각을 KST 날짜와 경과일로 돌려준다", () => {
    const rows = [
      // 이력: 변경 **전** 상태(active)가 그 상태의 효력 시각과 함께 남는다.
      row(1, "active", "2026-01-10T00:00:00Z"),
      row(0, "inactive", "2026-09-01T03:00:00Z"),
    ];
    expect(getMemberStatusSince(rows, "2026-10-15")).toEqual({
      status: "inactive",
      sinceDt: "2026-09-01",
      daysAgo: 44,
    });
  });

  it("비활성 중 역할만 바뀌어도 전환일이 당겨지지 않는다", () => {
    const rows = [
      row(1, "active", "2026-01-10T00:00:00Z"),
      // 9/1 비활성 → 10/10 관리자 지정 변경(상태는 inactive 그대로)
      row(2, "inactive", "2026-09-01T03:00:00Z"),
      row(0, "inactive", "2026-10-10T05:00:00Z"),
    ];
    expect(getMemberStatusSince(rows, "2026-10-15")?.sinceDt).toBe("2026-09-01");
  });

  it("삭제 경계를 넘어 이전 소속 에피소드까지 거슬러 가지 않는다", () => {
    const rows = [
      // 1차 소속: 가입 → 삭제
      row(1, "inactive", "2024-02-01T00:00:00Z"),
      row(2, "inactive", "2024-05-01T00:00:00Z", { delYn: true }),
      // 2차 소속(재가입): active → 비활성
      row(3, "active", "2026-03-01T00:00:00Z"),
      row(0, "inactive", "2026-09-20T00:00:00Z"),
    ];
    expect(getMemberStatusSince(rows, "2026-10-15")?.sinceDt).toBe("2026-09-20");
  });

  it("탈퇴는 leave_dt 를 eff_at 보다 먼저 본다", () => {
    const rows = [
      row(1, "active", "2024-01-10T00:00:00Z"),
      // 이관으로 eff_at 이 2026-07-15 로 뭉쳐 있어도 실제 탈퇴일은 leave_dt.
      row(0, "left", "2026-07-15T12:00:00Z", { leaveDt: "2025-03-14" }),
    ];
    expect(getMemberStatusSince(rows, "2026-10-15")).toEqual({
      status: "left",
      sinceDt: "2025-03-14",
      daysAgo: 580,
    });
  });

  it("leave_dt 가 없는 탈퇴는 이력을 거슬러 eff_at 으로 센다", () => {
    const rows = [
      row(1, "active", "2024-01-10T00:00:00Z"),
      row(2, "left", "2026-08-02T01:00:00Z"),
      // 탈퇴 후 역할 정리로 정본 eff_at 만 밀린 경우
      row(0, "left", "2026-10-01T01:00:00Z"),
    ];
    expect(getMemberStatusSince(rows, "2026-10-15")?.sinceDt).toBe("2026-08-02");
  });

  it("UTC 자정 직후(KST 다음날)는 KST 날짜로 찍는다", () => {
    // 2026-09-01T16:00:00Z = KST 2026-09-02 01:00 — UTC 로 읽으면 하루 밀린다.
    const rows = [
      row(1, "active", "2026-01-10T00:00:00Z"),
      row(0, "inactive", "2026-09-01T16:00:00Z"),
    ];
    expect(getMemberStatusSince(rows, "2026-10-15")?.sinceDt).toBe("2026-09-02");
  });

  it("오늘 전환했으면 0일", () => {
    const rows = [
      row(1, "active", "2026-01-10T00:00:00Z"),
      row(0, "inactive", "2026-10-15T02:00:00Z"),
    ];
    expect(getMemberStatusSince(rows, "2026-10-15")?.daysAgo).toBe(0);
  });

  it("이력이 전혀 없는 정본 한 줄짜리도 자기 eff_at 으로 센다", () => {
    const rows = [row(0, "left", "2026-10-01T00:00:00Z")];
    expect(getMemberStatusSince(rows, "2026-10-15")?.sinceDt).toBe("2026-10-01");
  });
});
