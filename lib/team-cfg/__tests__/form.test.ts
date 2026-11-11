import { describe, expect, it } from "vitest";

import {
  cfgStatus,
  CFG_GROUPS,
  CFG_ORDER,
  compareCfgOrder,
  isDefaultCfgValue,
  isEmptyValue,
  normalizeChannels,
  normalizeTeamLinks,
  summarizeCfg,
} from "@/lib/team-cfg/form";
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

  it("서버만 읽는 값(비밀값)은 화면에 값을 내보내지 않는 입력칸(secret)만 쓴다", () => {
    for (const def of Object.values(TEAM_CFG_REGISTRY)) {
      if (def.visibility === "server") expect(def.input.kind).toBe("secret");
    }
  });

  it("순서: 중요도 목록에 있는 키가 앞, 목록에 없는 새 키는 뒤(빠지지 않는다)", () => {
    expect(compareCfgOrder("feature.dues", "brand.wordmark")).toBeLessThan(0);
    expect(compareCfgOrder("brand.wordmark", "new.key")).toBeLessThan(0);
    // 순서 목록엔 사전에 있는 키만 — 이름을 바꾸고 목록을 안 고치면 그 키가 맨 뒤로 밀린다
    for (const cd of CFG_ORDER) expect(Object.keys(TEAM_CFG_REGISTRY)).toContain(cd);
  });

  it("요약: 비밀값은 값 대신 설정 여부만, 빈 값은 '설정 안 함'", () => {
    expect(summarizeCfg({ kind: "secret" }, true, "pw-1234")).toBe("설정됨");
    expect(summarizeCfg({ kind: "secret" }, false, null)).toBe("설정 안 함");
    expect(summarizeCfg({ kind: "boolean" }, false, true)).toBe("켜짐");
    expect(summarizeCfg({ kind: "channels" }, true, { instagram: "https://a", somoim: "https://b" })).toBe("2개 연결");
    expect(summarizeCfg({ kind: "channels" }, false, {})).toBe("설정 안 함");
    expect(summarizeCfg({ kind: "bank" }, true, { bank: "카카오뱅크", number: "3333", holder: "x" })).toBe("카카오뱅크 3333");
    expect(summarizeCfg({ kind: "text" }, false, null)).toBe("설정 안 함");
  });

  it("기본값과 같은 값을 저장하면 설정을 지운다 — 기본값이 없는 키는 빈 값이면 같다", () => {
    expect(isDefaultCfgValue(null, null)).toBe(true);
    expect(isDefaultCfgValue({}, {})).toBe(true);
    expect(isDefaultCfgValue({ instagram: "https://a" }, {})).toBe(false);
    expect(isDefaultCfgValue(true, true)).toBe(true);
    expect(isDefaultCfgValue(false, true)).toBe(false);
  });
});

describe("summarizeCfg — 여러 개 고르기(전당 종목)", () => {
  const input = TEAM_CFG_REGISTRY["records.categories"].input;

  it("고른 종목을 저장된 순서 그대로 이어 쓴다 — 그게 랭킹탭 탭 순서다", () => {
    expect(summarizeCfg(input, true, ["hyrox", "marathon"])).toBe("하이록스 · 러닝");
  });

  it("하나 고르기(모임 기본 종목)는 고른 종목 이름", () => {
    expect(summarizeCfg(TEAM_CFG_REGISTRY["gathering.default_sport"].input, true, "trail_run")).toBe("트레일러닝");
  });

  it("기본값(넷 다)과 같으면 설정을 지운다 — 기강은 행 없이 넷 다", () => {
    expect(isDefaultCfgValue(["marathon", "trail", "triathlon", "hyrox"], TEAM_CFG_REGISTRY["records.categories"].default)).toBe(true);
    expect(isDefaultCfgValue(["trail"], TEAM_CFG_REGISTRY["records.categories"].default)).toBe(false);
  });
});
