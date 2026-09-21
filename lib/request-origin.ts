import { headers } from "next/headers";

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
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;

  const isLocal =
    host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.endsWith(".localhost");
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}
