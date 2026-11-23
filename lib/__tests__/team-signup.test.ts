import { describe, expect, it } from "vitest";

import { JOIN_PURP_LABELS } from "@/lib/validations/member";
import { getTeamSignup, hasRunningProfileStep, isTeamJoinPurposes } from "@/lib/team-signup";

/** 팀별 가입 설정(#748) — 기강은 예전 그대로, 모비는 러닝 프로필 없이 트레일 목적 칩 */
describe("getTeamSignup", () => {
  it("기강은 예전 그대로 — 6단계, 로드러닝 목적 10개(순서 포함), 운영 안내 있음", () => {
    const s = getTeamSignup("gigang");
    expect(s.steps).toEqual(["시작", "로그인", "기본 정보", "러닝 프로필", "가입 목적", "참석 약속"]);
    expect(s.joinPurposes).toEqual([
      "RUN_MATE", "COACH", "TRAINING", "NEW_SPORT", "RACE", "FRIENDS", "HABIT", "FIRST_FINISH", "PB", "HEALTH",
    ]);
    expect(s.crewGuide).toBe(true);
    expect(hasRunningProfileStep(s)).toBe(true);
  });

  it("모비는 러닝 프로필 단계가 없는 5단계, 트레일 목적 9개, 운영 안내 없음", () => {
    const s = getTeamSignup("ulsan");
    expect(s.steps).toEqual(["시작", "로그인", "기본 정보", "가입 목적", "참석 약속"]);
    expect(hasRunningProfileStep(s)).toBe(false);
    expect(s.joinPurposes).toEqual([
      "MT_MATE", "TRAIL_START", "COACH", "RACE", "TRAIL_FINISH", "PB", "FRIENDS", "HABIT", "HEALTH",
    ]);
    // 로드러닝 표현(달릴 사람·인터벌·10K·하프·풀) 칩은 없다
    const labels = s.joinPurposes.map((c) => JOIN_PURP_LABELS[c]).join(" ");
    for (const word of ["달릴 사람", "인터벌", "10K", "하프", "풀"]) expect(labels).not.toContain(word);
    expect(s.crewGuide).toBe(false);
  });

  it("표에 없는 새 팀은 지금 기강 동작(6단계·로드러닝 목적) — 운영 안내만 없다", () => {
    const s = getTeamSignup("newteam");
    expect(s.steps).toEqual(getTeamSignup("gigang").steps);
    expect(s.joinPurposes).toEqual(getTeamSignup("gigang").joinPurposes);
    expect(s.crewGuide).toBe(false);
  });

  it("서버 검사 — 그 팀 칩만 받는다", () => {
    expect(isTeamJoinPurposes(getTeamSignup("ulsan"), ["MT_MATE", "HEALTH"])).toBe(true);
    expect(isTeamJoinPurposes(getTeamSignup("ulsan"), ["RUN_MATE"])).toBe(false);
    expect(isTeamJoinPurposes(getTeamSignup("gigang"), ["TRAIL_START"])).toBe(false);
    expect(isTeamJoinPurposes(getTeamSignup("gigang"), ["RUN_MATE", "PB"])).toBe(true);
  });
});
