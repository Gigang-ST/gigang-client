import { describe, expect, it } from "vitest";

import { resolvePhoneMatch } from "@/lib/onboarding-phone-match";

/**
 * 번호 조회 결과 → "이 사람을 어느 경로로 보낼까" 판정.
 *
 * 이 판정이 **계정의 주인을 정한다** — 결과의 `memId` 로 OAuth 가 연결되고 소속이 꽂히므로,
 * 여기서 한 명으로 좁혀지지 않으면 남의 계정에 붙을 수 있다. 그래서 0건·2건 이상은
 * 반드시 멈춘다(2건 이상은 관리자가 정리해야 하는 데이터 오류다).
 */

describe("resolvePhoneMatch", () => {
  it("일치하는 회원이 없으면 신규 가입", () => {
    expect(resolvePhoneMatch([], false)).toEqual({ kind: "new" });
  });

  it("한 명이고 현재 소속이 있으면 계정 연결", () => {
    expect(resolvePhoneMatch(["mem-1"], true)).toEqual({ kind: "active", memId: "mem-1" });
  });

  it("한 명인데 현재 소속이 없으면 재가입 — 삭제된 회원이다", () => {
    expect(resolvePhoneMatch(["mem-1"], false)).toEqual({ kind: "rejoin", memId: "mem-1" });
  });

  it("두 명 이상이면 멈춘다 — 누구에게 붙일지 정할 수 없다", () => {
    const r = resolvePhoneMatch(["mem-1", "mem-2"], false);
    expect(r.kind).toBe("ambiguous");
  });

  it("빈 값·중복은 걸러낸 뒤 센다", () => {
    // RPC 가 null 을 섞어 주거나 같은 id 를 두 번 돌려줘도 한 명이면 한 명이다.
    expect(resolvePhoneMatch(["mem-1", null, "mem-1", undefined], false)).toEqual({
      kind: "rejoin",
      memId: "mem-1",
    });
  });
});
