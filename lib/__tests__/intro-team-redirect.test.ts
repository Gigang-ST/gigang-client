import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { teamOnlyPathRedirect } from "@/lib/team-host";

// 인증 확인(Supabase)은 이 테스트의 관심이 아니다 — 통과한 요청은 200 으로 돌려준다.
vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}));

const { proxy } = await import("@/proxy");

/**
 * 크루 소개(`/join`)·회칙(`/rules`)은 본문이 기강 운영 내용이라 기강 전용이다(#658).
 * 다른 팀 주소로 열면 그 팀 홈으로 보낸다.
 */
describe("teamOnlyPathRedirect", () => {
  it.each(["/join", "/rules", "/about"])("기강은 %s 를 연다", (path) => {
    expect(teamOnlyPathRedirect(path, "gigang")).toBeNull();
  });

  it.each(["/join", "/rules", "/about"])("다른 팀은 홈으로 — 끝 / 가 붙어도 같다 (%s)", (path) => {
    expect(teamOnlyPathRedirect(path, "ulsan")).toBe("/");
    expect(teamOnlyPathRedirect(`${path}/`, "ulsan")).toBe("/");
  });

  it("전용 화면이 아니면 손대지 않는다", () => {
    expect(teamOnlyPathRedirect("/newbie", "ulsan")).toBeNull();
    expect(teamOnlyPathRedirect("/joined", "ulsan")).toBeNull();
    expect(teamOnlyPathRedirect("/", "ulsan")).toBeNull();
    expect(teamOnlyPathRedirect("/introduce", "ulsan")).toBeNull();
    expect(teamOnlyPathRedirect("/constructor", "ulsan")).toBeNull();
  });
});

function request(host: string, path = "/join") {
  return new NextRequest(`http://${host}${path}`, { headers: { host } });
}

describe("proxy — 팀 전용 화면 판정", () => {
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
