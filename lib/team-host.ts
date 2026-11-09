/**
 * 접속 주소(Host) → 팀 코드(team_cd) 판정. **정확한 주소만** 팀이 된다.
 *
 * 예전엔 첫 라벨을 팀 코드로 읽고, 표에 없으면 조용히 기강으로 보냈다. 그러면 오타 주소나
 * 연결만 해 두고 표에 안 넣은 주소(예: 새 팀)로 들어온 사람이 **에러 없이 기강 회원으로
 * 가입하고 기강 데이터에 글을 쓴다** — 아무도 눈치채지 못한다. 그래서 표에 없는 주소는
 * 팀이 없는 것(null)으로 보고, proxy가 404로 끊는다(`proxy.ts`).
 *
 * proxy에서 쓰므로 `next/headers`·env 없이 순수 문자열 비교만 한다(`public-paths.ts`와 같은 이유).
 * 회귀 테스트: `lib/__tests__/team-host.test.ts`.
 *
 * 주소를 바꾸거나 더할 땐 여기 한 곳만 고친다. 팀 데이터는 team_id로 묶여 있어 주소가 바뀌어도
 * 그대로다(브라우저는 새 주소를 다른 사이트로 보므로 로그인·홈 화면 설치는 다시 해야 한다).
 */

/** 정확히 일치하는 주소 → team_cd. 포트는 떼고 소문자로 비교한다. */
const TEAM_CD_BY_HOST: Readonly<Record<string, string>> = {
  // 기강
  "gigang.team": "gigang",
  "www.gigang.team": "gigang", // next.config.ts가 gigang.team으로 308 — 그 전에 404로 막지 않게
  "dev.gigang.team": "gigang",
  "gigang-client-theta.vercel.app": "gigang", // 운영 프로젝트(gigang-client)의 Vercel 기본 주소
  "gigang-client-dev.vercel.app": "gigang", // dev 프로젝트(gigang-client-dev)의 Vercel 기본 주소
  // 울산지부 — 임시 주소. 바뀌면 이 두 줄만 고친다.
  "ulsan.gigang.team": "ulsan",
  "dev.ulsan.gigang.team": "ulsan",
  // 로컬 개발 — *.localhost는 브라우저가 알아서 127.0.0.1로 보낸다(hosts 파일 불필요).
  localhost: "gigang",
  "127.0.0.1": "gigang",
  "ulsan.localhost": "ulsan",
};

/**
 * 이 프로젝트의 Vercel 미리보기 주소 → 기강.
 * `gigang-client-<해시>-…` / `gigang-client-git-<브랜치>-…` 둘 다 이 꼴이다. 아무 `*.vercel.app`이
 * 아니라 **우리 팀 계정 접미사**까지 맞아야 하므로 남의 배포나 오타가 걸리지 않는다.
 * 미리보기는 주소로 팀을 고를 수 없어 기강으로만 연다 — 울산 확인은 `ulsan.localhost`·`dev.ulsan…`으로.
 */
const VERCEL_PREVIEW_PREFIX = "gigang-client-";
const VERCEL_PREVIEW_SUFFIX = "-gigangs-projects-afd6ab2d.vercel.app";

/** Host 헤더 값을 비교용으로 다듬는다 — 첫 값만(x-forwarded-host는 쉼표 목록일 수 있다), 포트·끝점 제거, 소문자. */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const first = host.split(",")[0].trim().toLowerCase();
  const noPort = first.replace(/:\d+$/, "").replace(/\.$/, "");
  return noPort.length > 0 ? noPort : null;
}

/** 접속 주소의 team_cd. 정확한 주소가 아니면 `null`(= 없는 팀). */
export function resolveTeamCdFromHost(host: string | null | undefined): string | null {
  const h = normalizeHost(host);
  if (!h) return null;

  const exact = TEAM_CD_BY_HOST[h];
  if (exact) return exact;

  if (
    h.startsWith(VERCEL_PREVIEW_PREFIX) &&
    h.endsWith(VERCEL_PREVIEW_SUFFIX) &&
    h.length > VERCEL_PREVIEW_PREFIX.length + VERCEL_PREVIEW_SUFFIX.length
  ) {
    return "gigang";
  }

  return null;
}
