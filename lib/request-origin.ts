import { headers } from "next/headers";

import { normalizeHost } from "@/lib/team-host";

/**
 * 요청이 들어온 **호스트 원문의 첫 값**(포트 포함) — `x-forwarded-host ?? host`.
 *
 * 프록시를 여러 번 지나면 `x-forwarded-host: a.com, b.com` 처럼 쉼표 목록이 온다. 첫 값이 사용자가 친 주소다.
 * 팀 판정(`resolveTeamContextFromHost`)과 돌려보낼 주소(`buildRequestOrigin`)가 **같은 값**을 봐야 한다 —
 * 로그인 콜백에서 둘의 출처가 갈려 있었다(한쪽은 `request.url` 로 대체 — 로컬에선 늘 `localhost:3000`).
 */
export function pickRequestHost(forwardedHost: string | null, host: string | null): string | null {
  const raw = forwardedHost ?? host;
  if (!raw) return null;
  const first = raw.split(",")[0].trim().toLowerCase().replace(/\.(?=:\d+$|$)/, "");
  return first.length > 0 ? first : null;
}

/**
 * 호스트(포트 포함)와 `x-forwarded-proto` → origin. 순수 함수 — 회귀 테스트 `lib/__tests__/request-origin.test.ts`.
 *
 * - proto 도 쉼표 목록(`https,http`)일 수 있어 **첫 값**만 쓰고, http/https 가 아니면 버린다.
 * - proto 가 없으면 로컬(`localhost`·`127.0.0.1`·`*.localhost`)은 http, 나머지는 https.
 *   로컬 판정은 포트를 떼고 본다(`normalizeHost`) — `ulsan.localhost:3000` 이 포트 때문에 안 걸렸었다.
 */
export function buildRequestOrigin(host: string | null, forwardedProto: string | null): string | null {
  if (!host) return null;
  const hostname = normalizeHost(host);
  if (!hostname) return null;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
  const protoFirst = forwardedProto?.split(",")[0].trim().toLowerCase();
  const proto = protoFirst === "http" || protoFirst === "https" ? protoFirst : isLocal ? "http" : "https";
  return `${proto}://${host}`;
}

/**
 * 현재 요청의 origin(`https://gigang.team` 등).
 *
 * 링크를 지면 밖으로 내보낼 때 쓴다 — 카톡 공지처럼. 상수(`SITE_URL`)를 쓰면 dev·preview에서
 * 만든 모임 링크가 프로덕션을 가리켜 "눌렀는데 없는 모임"이 된다. 요청 Host를 따르면
 * 만든 그 환경으로 돌아온다(`getRequestTeamContext`가 team_cd를 뽑는 것과 같은 출처).
 *
 * ⚠️ `after()` 안에서 부르지 말 것 — 요청 컨텍스트가 끝난 뒤라 헤더를 못 읽는다.
 * 액션 본문에서 먼저 받아 두고 넘긴다.
 */
export async function getRequestOrigin(): Promise<string | null> {
  const h = await headers();
  return buildRequestOrigin(pickRequestHost(h.get("x-forwarded-host"), h.get("host")), h.get("x-forwarded-proto"));
}
