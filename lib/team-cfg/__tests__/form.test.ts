import { describe, expect, it } from "vitest";

import { cfgStatus, CFG_GROUPS, isEmptyValue, normalizeChannels, normalizeTeamLinks } from "@/lib/team-cfg/form";
import { TEAM_CFG_REGISTRY } from "@/lib/team-cfg/registry";

describe("팀 설정 화면 규칙", () => {
  it("상태: 정했으면 '이 팀 설정', 안 정했으면 기본값이 있으면 '기본값' 없으면 '설정 안 함'", () => {
    expect(cfgStatus(true, null)).toBe("set");
    expect(cfgStatus(false, true)).toBe("default");
    expect(cfgStatus(false, false)).toBe("default"); // false 도 값이다(끔)
    expect(cfgStatus(false, null)).toBe("empty");
    expect(cfgStatus(false, [])).toBe("empty");
    expect(cfgStatus(false, {})).toBe("empty");
  });

  it("빈 값 판정", () => {
    expect(isEmptyValue("  ")).toBe(true);
    expect(isEmptyValue("GIGANG")).toBe(false);
    expect(isEmptyValue(0)).toBe(false);
  });

  it("채널: 빈 칸은 키째 빠진다", () => {
    expect(normalizeChannels({ instagram: " https://a ", somoim: "" })).toEqual({ instagram: "https://a" });
  });

  it("다른 팀 안내: 팀 코드나 이름이 빈 줄은 빠진다", () => {
    expect(
      normalizeTeamLinks([
        { team_cd: "ulsan", name: " 울산지부 " },
        { team_cd: "", name: "x" },
        { team_cd: "busan", name: "" },
      ]),
    ).toEqual([{ team_cd: "ulsan", name: "울산지부" }]);
  });

  it("사전의 모든 키는 화면 묶음에 속한다 — 키를 더하면 설정 화면에 저절로 올라온다", () => {
    const groups = new Set(CFG_GROUPS.map((g) => g.group));
    for (const def of Object.values(TEAM_CFG_REGISTRY)) {
      expect(groups.has(def.group)).toBe(true);
    }
  });

  it("비밀값 묶음은 화면에 값을 내보내지 않는 입력칸(secret)만 쓴다", () => {
    for (const def of Object.values(TEAM_CFG_REGISTRY)) {
      if (def.group === "secret") expect(def.input.kind).toBe("secret");
      if (def.visibility === "server") expect(def.input.kind).toBe("secret");
    }
  });
});
