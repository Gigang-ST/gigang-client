import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TEAM_ID_BY_CD } from "@/lib/constants/gigang-team";
import { TEAM_LOGO, teamLogoCss, teamLogoForHost } from "@/lib/team-logo";

describe("teamLogoForHost — 화면 안 로고는 접속 주소의 팀 것", () => {
  it("기강 주소는 예전 고정 경로 그대로", () => {
    for (const host of ["gigang.team", "dev.gigang.team", "localhost:3000"]) {
      expect(teamLogoForHost(host)).toEqual({ logo: "/logo.webp", mark: "/logo-mark.png" });
    }
  });

  it("울산 주소는 모보브 로고", () => {
    for (const host of ["ulsan.gigang.team", "dev.ulsan.gigang.team", "ulsan.localhost:3000"]) {
      expect(teamLogoForHost(host)?.logo).toBe("/teams/ulsan/logo.png");
    }
  });

  it("모르는 주소면 null — 기강 로고로 물러나지 않는다", () => {
    expect(teamLogoForHost("unknown.example.com")).toBeNull();
    expect(teamLogoForHost(null)).toBeNull();
  });
});

describe("로고 표가 실제와 맞는가 — 새 팀을 붙일 때 빠뜨리거나 경로를 잘못 적으면 여기서 깨진다", () => {
  it("모든 팀이 로고를 갖는다(팀 ID 표의 팀 = 로고 표의 팀)", () => {
    expect(Object.keys(TEAM_LOGO).sort()).toEqual(Object.keys(TEAM_ID_BY_CD).sort());
  });

  it("표에 적은 그림 파일이 public/ 에 실제로 있다", () => {
    for (const [teamCd, { logo, mark }] of Object.entries(TEAM_LOGO)) {
      for (const path of [logo, mark]) {
        expect(existsSync(join(process.cwd(), "public", path)), `${teamCd}: ${path}`).toBe(true);
      }
    }
  });

  it("CSS 변수가 팀마다 걸린다 — 탭바·홈 로딩이 이 변수만 본다", () => {
    for (const [teamCd, { logo, mark }] of Object.entries(TEAM_LOGO)) {
      expect(teamLogoCss).toContain(`html[data-team="${teamCd}"]{--team-logo:url("${logo}");--team-logo-mark:url("${mark}")}`);
    }
  });
});
