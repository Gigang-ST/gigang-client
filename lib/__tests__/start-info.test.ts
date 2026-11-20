import { describe, expect, it } from "vitest";

import { buildStartInfoSummary } from "@/lib/mcp/queries";
import { JOIN_PURP_CODES, JOIN_SRC_CODES, onboardingProfileSchema } from "@/lib/validations/member";
import {
  draftFromValues,
  draftToValues,
  EMPTY_START_INFO,
  EMPTY_START_INFO_DRAFT,
  formatRecTime,
  hasStartInfo,
  invalidTimeRows,
  parseRecTime,
  startInfoSchema,
} from "@/lib/validations/start-info";

describe("기록 시간 파싱", () => {
  it("분:초 · 시:분:초를 초로 바꾼다", () => {
    expect(parseRecTime("55:30")).toBe(3330);
    expect(parseRecTime("1:55:30")).toBe(6930);
    expect(parseRecTime(" 4:05:00 ")).toBe(14700);
  });
  it("못 읽거나 범위 밖이면 null", () => {
    for (const bad of ["", "55", "55:75", "1:75:00", "5:00", "25:00:00", "abc"]) {
      expect(parseRecTime(bad)).toBeNull();
    }
  });
  it("되돌려 찍으면 같은 문자열", () => {
    expect(formatRecTime(3330)).toBe("55:30");
    expect(formatRecTime(6930)).toBe("1:55:30");
  });
});

describe("시작 정보 입력 상태 ↔ 제출 값", () => {
  it("기본 화면은 10K 칸 하나, 아무것도 안 적으면 빈 값", () => {
    expect(EMPTY_START_INFO_DRAFT.rows).toEqual([{ distCd: "10K", timeInput: "" }]);
    expect(hasStartInfo(draftToValues(EMPTY_START_INFO_DRAFT))).toBe(false);
  });
  it("빈 칸·못 읽는 칸·중복 거리는 버린다", () => {
    const v = draftToValues({
      ...EMPTY_START_INFO_DRAFT,
      rows: [
        { distCd: "10K", timeInput: "55:30" },
        { distCd: "HALF", timeInput: "" },
        { distCd: "FULL", timeInput: "99" },
        { distCd: "10K", timeInput: "50:00" },
      ],
    });
    expect(v.records).toEqual([{ distCd: "10K", recSec: 3330 }]);
  });
  it("완주 못 해봄이면 기록은 비운다", () => {
    const v = draftToValues({
      ...EMPTY_START_INFO_DRAFT,
      recNone: true,
      rows: [{ distCd: "10K", timeInput: "55:30" }],
    });
    expect(v).toMatchObject({ recNone: true, records: [] });
    expect(startInfoSchema.safeParse(v).success).toBe(true);
  });
  it("못 읽는 시간 칸은 안내 대상으로 짚는다", () => {
    expect(invalidTimeRows({ ...EMPTY_START_INFO_DRAFT, rows: [{ distCd: "10K", timeInput: "9" }] })).toEqual([0]);
  });
  it("값 → 입력 상태로 왕복해도 같다", () => {
    const v = { ...EMPTY_START_INFO, runCareerCd: "Y1_3" as const, records: [{ distCd: "HALF" as const, recSec: 7200 }] };
    expect(draftToValues(draftFromValues(v))).toEqual(v);
  });
});

describe("스키마", () => {
  it("완주 못 해봄과 기록을 같이 낼 수 없다", () => {
    expect(
      startInfoSchema.safeParse({ ...EMPTY_START_INFO, recNone: true, records: [{ distCd: "10K", recSec: 3000 }] }).success,
    ).toBe(false);
  });
  it("같은 거리 중복·범위 밖 기록은 거절", () => {
    const r = { distCd: "10K" as const, recSec: 3000 };
    expect(startInfoSchema.safeParse({ ...EMPTY_START_INFO, records: [r, r] }).success).toBe(false);
    expect(startInfoSchema.safeParse({ ...EMPTY_START_INFO, records: [{ distCd: "10K", recSec: 5 }] }).success).toBe(false);
  });
  it("가입 스키마는 시작 정보가 없어도 통과한다(옛 클라이언트·건너뛰기)", () => {
    const r = onboardingProfileSchema.safeParse({
      nearStnNm: null,
      avgRunDistKm: null,
      avgPaceCd: null,
      joinPurpCds: ["HABIT"],
      joinPurpTxt: null,
      joinSrcCd: "FRIEND",
      joinSrcTxt: null,
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.startInfo).toEqual(EMPTY_START_INFO);
  });
});

describe("칩 코드 — 기존 순서 보존", () => {
  it("기존 가입 목적 7종이 앞 순서 그대로, 새 칩은 뒤에 붙는다", () => {
    expect(JOIN_PURP_CODES.slice(0, 7)).toEqual(["RUN_MATE", "COACH", "TRAINING", "NEW_SPORT", "RACE", "FRIENDS", "HABIT"]);
    expect(JOIN_PURP_CODES.slice(7)).toEqual(["FIRST_FINISH", "PB", "HEALTH"]);
  });
  it("유입 경로는 기존 4종 순서 유지 + 기타가 맨 끝", () => {
    expect(JOIN_SRC_CODES.slice(0, 4)).toEqual(["FRIEND", "INSTA", "SOMOIM", "DAANGN"]);
    expect(JOIN_SRC_CODES.at(-1)).toBe("ETC");
  });
});

describe("운영 MCP 시작 정보 요약", () => {
  it("입력한 적 없으면 null", () => {
    expect(buildStartInfoSummary({ start_info_at: null }, [])).toBeNull();
  });
  it("코드를 라벨로 풀고 기록은 거리 순서로 정렬한다", () => {
    const s = buildStartInfoSummary(
      {
        run_career_cd: "Y1_3",
        wkly_dist_cd: "KM30_50",
        start_rec_none_yn: false,
        start_info_src_cd: "SIGNUP",
        start_info_at: "2026-11-20T01:00:00Z",
      },
      [
        { dist_cd: "HALF", rec_sec: 6930 },
        { dist_cd: "10K", rec_sec: 3330 },
      ],
    );
    expect(s).toEqual({
      run_career: "1~3년",
      weekly_distance: "30~50km",
      never_finished: false,
      self_reported_records: [
        { distance: "10K", time: "55:30" },
        { distance: "하프", time: "1:55:30" },
      ],
      entered_via: "가입 때",
      entered_at: "2026-11-20T01:00:00Z",
    });
  });
});

describe("시간 파싱 경계값", () => {
  it("0:00:00 은 거절, 상·하한(10:00 · 24:00:00)은 포함, 그 밖은 거절", () => {
    expect(parseRecTime("0:00:00")).toBeNull();
    expect(parseRecTime("9:59")).toBeNull();
    expect(parseRecTime("10:00")).toBe(600);
    expect(parseRecTime("24:00:00")).toBe(86400);
    expect(parseRecTime("24:00:01")).toBeNull();
  });
  it("100:00 은 100분(6000초)으로 읽는다 — 분 칸은 3자리까지", () => {
    expect(parseRecTime("100:00")).toBe(6000);
    expect(parseRecTime("1000:00")).toBeNull();
  });
});
