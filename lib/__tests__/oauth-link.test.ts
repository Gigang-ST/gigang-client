import { describe, expect, it } from "vitest";

import { decideOauthLink } from "@/lib/oauth-link";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const MEM = "33333333-3333-4333-8333-333333333333";

describe("decideOauthLink — 전화번호로 기존 회원에 로그인 연결", () => {
  it("로그인이 하나도 없는 회원(엑셀 시절 회원)에는 지금 로그인을 붙인다", () => {
    expect(decideOauthLink({ mem_id: MEM, oauth_kakao_id: null, oauth_google_id: null }, ME, "google")).toEqual({
      kind: "link",
      column: "oauth_google_id",
    });
  });

  it("지금 로그인이 이미 그 회원 것이면 바꿀 게 없다(같은 계정으로 다른 팀에 가입)", () => {
    expect(decideOauthLink({ mem_id: MEM, oauth_kakao_id: ME, oauth_google_id: null }, ME, "kakao")).toEqual({
      kind: "already",
    });
    // 앱에서 직접 가입한 회원은 mem_id 가 로그인 id 다
    expect(decideOauthLink({ mem_id: ME, oauth_kakao_id: null, oauth_google_id: null }, ME, "kakao")).toEqual({
      kind: "already",
    });
  });

  it("카카오로 가입한 회원의 번호로 구글 로그인을 붙이려 하면 막는다(계정 가로채기)", () => {
    expect(decideOauthLink({ mem_id: MEM, oauth_kakao_id: OTHER, oauth_google_id: null }, ME, "google")).toEqual({
      kind: "blocked",
    });
  });

  it("같은 종류라도 다른 계정이 붙어 있으면 막는다", () => {
    expect(decideOauthLink({ mem_id: MEM, oauth_kakao_id: OTHER, oauth_google_id: null }, ME, "kakao")).toEqual({
      kind: "blocked",
    });
  });
});
