import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { buildRequestOrigin, pickRequestHost } from "@/lib/request-origin";

describe("pickRequestHost — 요청 호스트 첫 값", () => {
  it("x-forwarded-host 가 있으면 그것, 없으면 host", () => {
    expect(pickRequestHost("ulsan.gigang.team", "internal:3000")).toBe("ulsan.gigang.team");
    expect(pickRequestHost(null, "localhost:3000")).toBe("localhost:3000");
    expect(pickRequestHost(null, null)).toBeNull();
  });

  it("프록시를 여러 번 지난 쉼표 목록은 첫 값 — 사용자가 친 주소", () => {
    expect(pickRequestHost("ulsan.gigang.team, gigang-client.vercel.app", null)).toBe("ulsan.gigang.team");
  });

  it("대문자·끝점은 다듬고 포트는 남긴다(돌려보낼 주소에 필요)", () => {
    expect(pickRequestHost("Ulsan.Localhost:3000", null)).toBe("ulsan.localhost:3000");
    expect(pickRequestHost("gigang.team.", null)).toBe("gigang.team");
  });
});

describe("buildRequestOrigin — 호스트 + proto → origin", () => {
  it("운영은 https, proto 헤더가 있으면 그걸 따른다", () => {
    expect(buildRequestOrigin("gigang.team", null)).toBe("https://gigang.team");
    expect(buildRequestOrigin("gigang.team", "https")).toBe("https://gigang.team");
  });

  it("로컬은 포트가 붙어도 http — *.localhost 포함", () => {
    expect(buildRequestOrigin("localhost:3000", null)).toBe("http://localhost:3000");
    expect(buildRequestOrigin("ulsan.localhost:3000", null)).toBe("http://ulsan.localhost:3000");
    expect(buildRequestOrigin("127.0.0.1:3000", null)).toBe("http://127.0.0.1:3000");
  });

  it("proto 가 쉼표 목록이면 첫 값만, 이상한 값이면 버리고 기본값", () => {
    expect(buildRequestOrigin("gigang.team", "https,http")).toBe("https://gigang.team");
    expect(buildRequestOrigin("localhost:3000", "HTTP")).toBe("http://localhost:3000");
    expect(buildRequestOrigin("gigang.team", "javascript")).toBe("https://gigang.team");
  });

  it("호스트가 없으면 null", () => {
    expect(buildRequestOrigin(null, "https")).toBeNull();
  });
});
