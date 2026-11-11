import { describe, expect, it } from "vitest";

import { TEAM_LOGO, teamLogoForHost } from "@/lib/team-logo";
import { TEAM_SITE } from "@/lib/team-site";

describe("teamLogoForHost — 화면 안 로고(탭바·홈 로딩·로그인)는 접속 주소의 팀 것", () => {
  it("기강 주소는 기강 로고 — 예전 고정 경로 그대로", () => {
    for (const host of ["gigang.team", "dev.gigang.team", "localhost:3000"]) {
      expect(teamLogoForHost(host)).toEqual({ logo: "/logo.webp", mark: "/logo-mark.png", alt: "기강" });
    }
  });

  it("울산 주소는 모보브 로고", () => {
    for (const host of ["ulsan.gigang.team", "dev.ulsan.gigang.team", "ulsan.localhost:3000"]) {
      expect(teamLogoForHost(host)?.logo).toBe("/teams/ulsan/logo.png");
      expect(teamLogoForHost(host)?.alt).toBe("모보브");
    }
  });

  it("모르는 주소면 null — 기강 로고로 물러나지 않는다(그 자리를 비워 둔다)", () => {
    expect(teamLogoForHost("unknown.example.com")).toBeNull();
    expect(teamLogoForHost(null)).toBeNull();
  });
});

describe("로고 경로는 한 곳", () => {
  it("구조화 데이터(네이버)의 logo 가 화면 안 로고와 같은 그림", () => {
    expect(TEAM_SITE.gigang.logo).toBe(TEAM_LOGO.gigang.logo);
    expect(TEAM_SITE.ulsan.logo).toBe(TEAM_LOGO.ulsan.logo);
  });
});
