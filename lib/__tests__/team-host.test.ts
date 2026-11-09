import { describe, expect, it } from "vitest";
import { hostFamily, normalizeHost, resolveTeamCdFromHost, teamLinkOrigin } from "@/lib/team-host";
import { resolveTeamContextFromHost } from "@/lib/queries/request-team";
import { TEAM_ID_BY_CD } from "@/lib/constants/gigang-team";

/**
 * 접속 주소 → 팀 판정 회귀 테스트.
 *
 * 핵심은 **모르는 주소가 기강이 되지 않는 것**이다. 예전엔 표에 없는 주소를 조용히 기강으로
 * 보냈고, 그러면 오타·미등록 주소로 들어온 사람이 에러 없이 기강 데이터에 쓴다.
 */
describe("resolveTeamCdFromHost", () => {
  it.each([
    ["gigang.team", "gigang"],
    ["www.gigang.team", "gigang"],
    ["dev.gigang.team", "gigang"],
    ["gigang-client-theta.vercel.app", "gigang"],
    ["gigang-client-dev.vercel.app", "gigang"],
    ["ulsan.gigang.team", "ulsan"],
    ["dev.ulsan.gigang.team", "ulsan"],
    ["localhost", "gigang"],
    ["127.0.0.1", "gigang"],
    ["ulsan.localhost", "ulsan"],
  ])("등록된 주소 %s → %s", (host, teamCd) => {
    expect(resolveTeamCdFromHost(host)).toBe(teamCd);
  });

  it("포트·대문자·끝점·쉼표 목록을 다듬어서 본다", () => {
    expect(resolveTeamCdFromHost("localhost:3000")).toBe("gigang");
    expect(resolveTeamCdFromHost("ulsan.localhost:3000")).toBe("ulsan");
    expect(resolveTeamCdFromHost("Ulsan.Gigang.Team")).toBe("ulsan");
    expect(resolveTeamCdFromHost("gigang.team.")).toBe("gigang");
    expect(resolveTeamCdFromHost("ulsan.gigang.team, proxy.internal")).toBe("ulsan");
  });

  it.each([
    "ulsna.gigang.team", // 오타
    "busan.gigang.team", // 등록 안 된 팀
    "gigang.tem",
    "evil.com",
    "gigang.team.evil.com",
    "stg.gigang.team", // 쓰지 않는 환경 주소는 열지 않는다
    "foo.localhost",
    "192.168.0.10", // 같은 와이파이의 폰으로 dev 서버 접속 — 의도적으로 막는다(표에 추가해서 연다)
  ])("모르는 주소 %s 는 기강으로 폴백하지 않는다", (host) => {
    expect(resolveTeamCdFromHost(host)).toBeNull();
  });

  it("비어 있으면 팀이 없다", () => {
    expect(resolveTeamCdFromHost(null)).toBeNull();
    expect(resolveTeamCdFromHost(undefined)).toBeNull();
    expect(resolveTeamCdFromHost("")).toBeNull();
  });

  describe("Vercel 미리보기", () => {
    it("이 프로젝트의 미리보기 주소는 기강", () => {
      expect(
        resolveTeamCdFromHost("gigang-client-l3z8osung-gigangs-projects-afd6ab2d.vercel.app"),
      ).toBe("gigang");
      expect(
        resolveTeamCdFromHost("gigang-client-git-feature-multi-team-gigangs-projects-afd6ab2d.vercel.app"),
      ).toBe("gigang");
    });

    it("다른 프로젝트·다른 계정의 vercel.app 은 막는다", () => {
      expect(resolveTeamCdFromHost("other-app-abc-gigangs-projects-afd6ab2d.vercel.app")).toBeNull();
      expect(resolveTeamCdFromHost("gigang-client-abc-someone-else.vercel.app")).toBeNull();
      expect(resolveTeamCdFromHost("gigang-client.vercel.app")).toBeNull();
      // 접두사와 접미사만 붙여 만든 껍데기
      expect(resolveTeamCdFromHost("gigang-client--gigangs-projects-afd6ab2d.vercel.app")).toBeNull();
    });
  });
});

describe("normalizeHost", () => {
  it("공백·빈 값은 null", () => {
    expect(normalizeHost("  ")).toBeNull();
    expect(normalizeHost(":3000")).toBeNull();
  });
});

describe("resolveTeamContextFromHost", () => {
  it("팀 코드와 고정 UUID를 함께 준다", () => {
    expect(resolveTeamContextFromHost("ulsan.gigang.team")).toEqual({
      teamCd: "ulsan",
      teamId: TEAM_ID_BY_CD.ulsan,
    });
    expect(resolveTeamContextFromHost("gigang.team")).toEqual({
      teamCd: "gigang",
      teamId: TEAM_ID_BY_CD.gigang,
    });
  });

  it("모르는 주소는 null — 기강 UUID를 돌려주지 않는다", () => {
    expect(resolveTeamContextFromHost("typo.gigang.team")).toBeNull();
  });

  it("주소 표의 모든 팀 코드는 UUID 표에 있다", () => {
    for (const host of ["gigang.team", "ulsan.gigang.team"]) {
      const cd = resolveTeamCdFromHost(host);
      expect(cd && TEAM_ID_BY_CD[cd]).toBeTruthy();
    }
  });
});

/**
 * 팀 링크 origin — 운영 MCP 처럼 "토큰 팀 것"을 가리키는 링크는 접속 주소가 아니라 그 팀 주소여야 한다.
 * 울산 모임은 울산 주소에서만 열리므로, 기강 주소로 링크를 만들면 "없는 모임"으로 떨어진다.
 */
describe("teamLinkOrigin", () => {
  it("접속 주소가 그 팀 주소면 그대로 쓴다", () => {
    expect(teamLinkOrigin("ulsan", "ulsan.gigang.team")).toBe("https://ulsan.gigang.team");
    expect(teamLinkOrigin("gigang", "gigang.team")).toBe("https://gigang.team");
    expect(teamLinkOrigin("ulsan", "ulsan.localhost:3000")).toBe("http://ulsan.localhost:3000");
  });

  it("다른 팀 주소로 들어오면 같은 환경의 그 팀 주소로 바꾼다", () => {
    expect(teamLinkOrigin("ulsan", "gigang.team")).toBe("https://ulsan.gigang.team");
    expect(teamLinkOrigin("ulsan", "dev.gigang.team")).toBe("https://dev.ulsan.gigang.team");
    expect(teamLinkOrigin("ulsan", "localhost:3000")).toBe("http://ulsan.localhost:3000");
    expect(teamLinkOrigin("gigang", "ulsan.gigang.team")).toBe("https://gigang.team");
  });

  it("모르는 팀이면 null(호출부가 상대 경로로 물러난다)", () => {
    expect(teamLinkOrigin("busan", "gigang.team")).toBeNull();
  });

  it("환경 판정", () => {
    expect(hostFamily("gigang.team")).toBe("prd");
    expect(hostFamily("dev.ulsan.gigang.team")).toBe("dev");
    expect(hostFamily("gigang-client-dev.vercel.app")).toBe("dev");
    expect(hostFamily("ulsan.localhost:3000")).toBe("local");
  });
});

