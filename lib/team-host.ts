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
/** 미리보기 주소가 여는 팀 */
const PREVIEW_TEAM_CD = "gigang";

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

  // 표에 **실제로 있는 키**만 — `TEAM_CD_BY_HOST[h]` 로 바로 읽으면 주소가 `constructor` 같은 기본 속성 이름일 때
  // 함수가 나와 「아는 팀」으로 통과했다(그리기 전 스크립트와 대조하는 테스트가 잡았다)
  const exact = Object.hasOwn(TEAM_CD_BY_HOST, h) ? TEAM_CD_BY_HOST[h] : undefined;
  if (exact) return exact;

  if (
    h.startsWith(VERCEL_PREVIEW_PREFIX) &&
    h.endsWith(VERCEL_PREVIEW_SUFFIX) &&
    h.length > VERCEL_PREVIEW_PREFIX.length + VERCEL_PREVIEW_SUFFIX.length
  ) {
    return PREVIEW_TEAM_CD;
  }

  return null;
}

/** 이 팀으로 판정되는 정확한 주소들(포트 없음) — 미리보기 접미사 규칙은 빠진다 */
export function hostsOfTeam(teamCd: string): string[] {
  return Object.keys(TEAM_CD_BY_HOST).filter((h) => TEAM_CD_BY_HOST[h] === teamCd);
}

/**
 * `/manifest.webmanifest` 를 **그 팀 manifest 로** 돌린다 — `next.config.ts` 의 `redirects()` 가 쓴다(#658).
 *
 * 루트 `public/manifest.webmanifest` 는 기강 것이다(이미 설치된 기강 앱이 그 주소를 들고 있어 옮기지 않는다 — `lib/team-site.ts`).
 * 화면은 `<link rel="manifest">` 로 각 팀 파일을 가리키니 실사용엔 영향이 없지만, 울산 주소로 이 경로를 **직접** 열면 기강 이름·아이콘이
 * 나왔다. 정적 파일이라 proxy 를 안 타므로(matcher 제외) 주소 조건 리다이렉트로 돌린다. 팀 파일 자리는 `/teams/<팀 코드>/` 약속을
 * 따르고, 그 약속은 테스트가 `TEAM_SITE` 와 대조한다(`lib/__tests__/team-host.test.ts`). 기강 주소는 손대지 않는다.
 */
export function teamManifestRedirects() {
  const teams = new Set(Object.values(TEAM_CD_BY_HOST).filter((cd) => cd !== "gigang"));
  return [...teams].flatMap((teamCd) =>
    hostsOfTeam(teamCd).map((host) => ({
      source: "/manifest.webmanifest",
      has: [{ type: "host" as const, value: host }],
      destination: `/teams/${teamCd}/manifest.webmanifest`,
      permanent: false,
    })),
  );
}

/**
 * 한 팀 전용 화면 → 그 화면의 주인 팀. 다른 팀 주소로 들어오면 그 팀의 홈(`/`)으로 보낸다.
 *
 * - `/join`(크루 소개)·`/rules`(회칙)는 본문 전체가 기강 운영 내용이다 — 양재천·영동2교 집결, 단장 연락처, 86년생 나이 제한,
 *   회비. 다른 팀 운영 내용은 아직 없어 지어낼 수 없으므로 그 팀 주소에선 홈으로 보낸다(#658). 더보기 「○○ 소개」 줄도
 *   이 표를 보고 숨는다(`app/(info)/settings/page.tsx`), 사이트맵도 이 표로 거른다(`app/sitemap.ts`).
 *   그 팀 소개를 만들게 되면 여기서 빼고 지면을 팀별로 나눈다.
 * proxy에서 쓰므로 순수 문자열 비교만 한다(이 파일 머리 주석과 같은 이유).
 */
const TEAM_ONLY_PATHS: Readonly<Record<string, string>> = {
  "/join": "gigang",
  "/rules": "gigang",
};

/** 이 팀이 이 화면을 못 여는가 → 보낼 곳(`/`). 열 수 있으면 `null`. 끝 `/` 붙은 주소도 같은 화면으로 본다. */
export function teamOnlyPathRedirect(pathname: string, teamCd: string | null): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const owner = Object.hasOwn(TEAM_ONLY_PATHS, path) ? TEAM_ONLY_PATHS[path] : undefined;
  if (!owner || owner === teamCd) return null;
  return "/";
}

/**
 * **그리기 전에** 도는 인라인 스크립트 — 주소로 팀을 판정해 `<html data-team="ulsan">` 을 붙인다(`app/layout.tsx`).
 *
 * 미리 만들어 두는 껍데기(정적 셸)는 어느 팀 주소로 올지 모른 채 빌드 때 한 번 그려진다. 그래서 하단 탭바 로고·홈 로딩 워터마크처럼
 * 껍데기에 있는 팀 그림은 서버가 못 고른다. 이 표시를 붙여 두면 CSS(`teamLogoCss`, `lib/team-logo.ts`)가 **첫 화면부터** 그 팀
 * 그림을 고른다 — 브라우저가 페이지를 이어받을 때까지 비워 두면 새로고침마다 로고가 비었다가 튀어나왔다(리뷰 2026-11-11).
 * 화면 폭의 `shellWidthBootScript`(`lib/app-shell.ts`)와 같은 이유·같은 자리다. **빼지 않는다.**
 *
 * 판정 규칙은 `resolveTeamCdFromHost` 와 **같아야 한다** — 같은 표(`TEAM_CD_BY_HOST`)·접두사·접미사를 문자열로 박아 넣고,
 * 회귀 테스트(`lib/__tests__/team-host.test.ts`)가 스크립트를 실제로 돌려 두 결과를 주소마다 대조한다.
 * 모르는 주소면 아무것도 안 붙인다(다른 팀 그림으로 물러나지 않는다). `<html>` 은 `suppressHydrationWarning` 이라 하이드레이션 경고가 없다.
 */
export const teamHostBootScript = `(function(){try{
var h=(location.host||"").split(",")[0].trim().toLowerCase().replace(/:\\d+$/,"").replace(/\\.$/,"");
var m=${JSON.stringify(TEAM_CD_BY_HOST)},t=Object.prototype.hasOwnProperty.call(m,h)?m[h]:null;
var P=${JSON.stringify(VERCEL_PREVIEW_PREFIX)},S=${JSON.stringify(VERCEL_PREVIEW_SUFFIX)};
if(!t&&h.indexOf(P)===0&&h.length>P.length+S.length&&h.slice(-S.length)===S)t=${JSON.stringify(PREVIEW_TEAM_CD)};
if(t)document.documentElement.setAttribute("data-team",t);
}catch(e){}})();`;

/**
 * 팀의 **정식 주소** — 접속 주소가 아니라 "그 팀 것"을 가리키는 링크를 만들 때 쓴다.
 * 예: 운영 MCP 는 토큰이 팀에 묶여 있어, 울산 토큰으로 `gigang.team/api/mcp` 에 붙어도 링크는 울산 주소여야 한다
 * (울산 모임은 울산 주소에서만 열린다). 주소를 바꿀 땐 위 표와 이 표를 같이 고친다.
 */
const CANONICAL_HOST_BY_TEAM: Readonly<Record<string, Record<HostFamily, string>>> = {
  gigang: { prd: "gigang.team", dev: "dev.gigang.team", local: "localhost" },
  ulsan: { prd: "ulsan.gigang.team", dev: "dev.ulsan.gigang.team", local: "ulsan.localhost" },
};

export type HostFamily = "prd" | "dev" | "local";

/** 접속 주소가 운영·dev·로컬 중 어디인가 — 같은 환경 안에서 다른 팀 주소를 고르기 위해 */
export function hostFamily(host: string | null | undefined): HostFamily {
  const h = normalizeHost(host);
  if (!h) return "prd";
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost")) return "local";
  if (h.startsWith("dev.") || h === "gigang-client-dev.vercel.app") return "dev";
  // 미리보기 주소는 PR 확인용이라 dev 로 본다
  if (h.startsWith(VERCEL_PREVIEW_PREFIX) && h.endsWith(VERCEL_PREVIEW_SUFFIX)) return "dev";
  return "prd";
}

/** 팀 코드 + 환경 → 그 팀 정식 주소(포트 없음). 모르는 팀이면 null. */
export function canonicalTeamHost(teamCd: string, family: HostFamily): string | null {
  return CANONICAL_HOST_BY_TEAM[teamCd]?.[family] ?? null;
}

/**
 * 링크 origin — 접속 주소가 **그 팀 주소면 그대로**, 다른 팀(또는 모르는) 주소면 같은 환경의 그 팀 정식 주소.
 * 로컬은 접속 주소의 포트를 이어 붙인다. 정할 수 없으면 null(호출부가 상대 경로로 물러난다).
 */
export function teamLinkOrigin(teamCd: string, requestHost: string | null | undefined): string | null {
  const raw = requestHost?.split(",")[0].trim() ?? "";
  const family = hostFamily(raw);
  const proto = family === "local" ? "http" : "https";
  if (raw && resolveTeamCdFromHost(raw) === teamCd) return `${proto}://${raw.toLowerCase()}`;
  const canonical = canonicalTeamHost(teamCd, family);
  if (!canonical) return null;
  const port = family === "local" ? (raw.match(/:(\d+)$/)?.[1] ?? null) : null;
  return `${proto}://${canonical}${port ? `:${port}` : ""}`;
}

