import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { teamOnlyPathRedirect } from "@/lib/team-host";

// 인증 확인(Supabase)은 이 테스트의 관심이 아니다 — 통과한 요청은 200 으로 돌려준다.
vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}));

const { proxy } = await import("@/proxy");

/**
 * `/intro` 는 서울 기강 전용 랜딩이다(2026-11-15 결정). 다른 팀 주소로 열면 그 팀 홈으로 보낸다.
 */
describe("teamOnlyPathRedirect", () => {
  it("기강은 /intro 를 연다", () => {
    expect(teamOnlyPathRedirect("/intro", "gigang")).toBeNull();
  });

  it("다른 팀은 홈으로 — 끝 / 가 붙어도 같다", () => {
    expect(teamOnlyPathRedirect("/intro", "ulsan")).toBe("/");
    expect(teamOnlyPathRedirect("/intro/", "ulsan")).toBe("/");
  });

  // 크루 소개·회칙은 본문이 기강 운영 내용이라 기강 전용(#658)
  it.each(["/join", "/rules", "/join/", "/about", "/about/"])("%s 도 기강 전용 — 기강은 열고 다른 팀은 홈으로", (path) => {
    expect(teamOnlyPathRedirect(path, "gigang")).toBeNull();
    expect(teamOnlyPathRedirect(path, "ulsan")).toBe("/");
  });

  it("전용 화면이 아니면 손대지 않는다", () => {
    expect(teamOnlyPathRedirect("/newbie", "ulsan")).toBeNull();
    expect(teamOnlyPathRedirect("/joined", "ulsan")).toBeNull();
    expect(teamOnlyPathRedirect("/", "ulsan")).toBeNull();
    expect(teamOnlyPathRedirect("/introduce", "ulsan")).toBeNull();
    expect(teamOnlyPathRedirect("/constructor", "ulsan")).toBeNull();
  });
});

function request(host: string, path = "/intro") {
  return new NextRequest(`http://${host}${path}`, { headers: { host } });
}

describe("proxy — /intro 팀 판정", () => {
  it.each(["gigang.team", "dev.gigang.team", "localhost:3000"])("기강 주소 %s → 200", async (host) => {
    const res = await proxy(request(host));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it.each(["ulsan.gigang.team", "dev.ulsan.gigang.team", "ulsan.localhost:3000"])(
    "울산 주소 %s → 그 주소의 홈으로",
    async (host) => {
      const res = await proxy(request(host));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/");
      expect(new URL(res.headers.get("location") ?? "").host).toBe(host);
    },
  );

  it("울산 주소의 다른 화면은 그대로 통과한다", async () => {
    const res = await proxy(request("ulsan.gigang.team", "/"));
    expect(res.status).toBe(200);
  });
});
