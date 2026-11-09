import { describe, expect, it, vi } from "vitest";

import { isTeamCfgCd, resolveTeamCfgValue } from "@/lib/team-cfg/registry";

/**
 * 팀 설정 사전 회귀 테스트 — "행이 없으면 기본값, 값이 이상해도 기본값"이 이 구조의 약속이다.
 */
describe("resolveTeamCfgValue", () => {
  it("행이 없으면 기본값 — 카톡방은 기본값이 없어 null(보내지 않음)", () => {
    expect(resolveTeamCfgValue("kakao.room_id", undefined)).toBeNull();
  });

  it("값이 있으면 그 값(앞뒤 공백은 정리)", () => {
    expect(resolveTeamCfgValue("kakao.room_id", " 4b492fd2-bb84-43be-a663-4e5f087ffb2e ")).toBe(
      "4b492fd2-bb84-43be-a663-4e5f087ffb2e",
    );
  });

  it("명시적으로 비운 값(null)은 비운 그대로", () => {
    expect(resolveTeamCfgValue("kakao.room_id", null)).toBeNull();
  });

  it("형식이 틀리면 기본값으로 돌고 경고만 남긴다 — 잘못 넣어도 화면이 깨지지 않는다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveTeamCfgValue("kakao.room_id", 12345)).toBeNull();
    expect(resolveTeamCfgValue("kakao.room_id", "")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe("isTeamCfgCd", () => {
  it("사전에 있는 키만 인정한다", () => {
    expect(isTeamCfgCd("kakao.room_id")).toBe(true);
    expect(isTeamCfgCd("kakao.roomid")).toBe(false);
    expect(isTeamCfgCd("toString")).toBe(false);
  });
});

describe("다른 팀 값이 새면 안 되는 키 — 기본값이 비어 있다(멀티팀)", () => {
  it("계좌·채널·오픈채팅 비밀번호는 행이 없으면 아무것도 안 보인다(기강 값을 기본으로 두지 않는다)", () => {
    expect(resolveTeamCfgValue("bank.team_account", undefined)).toBeNull();
    expect(resolveTeamCfgValue("social.channels", undefined)).toEqual({});
    expect(resolveTeamCfgValue("social.kakao_open_chat_password", undefined)).toBeNull();
  });

  it("채널 주소가 URL 이 아니면 기본값(채널 없음)으로 물러난다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveTeamCfgValue("social.channels", { instagram: "not a url" })).toEqual({});
    warn.mockRestore();
  });
});

describe("feature.dues — 회비 기능", () => {
  it("행이 없으면 지금 기강 동작(켬), 끈 팀은 끔", () => {
    expect(resolveTeamCfgValue("feature.dues", undefined)).toBe(true);
    expect(resolveTeamCfgValue("feature.dues", false)).toBe(false);
  });
});
