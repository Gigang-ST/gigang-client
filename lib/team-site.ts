/**
 * 팀별 **정적 파일·주소에 묶인 값** — 배포와 함께 나가는 것들이라 팀 설정(`team_cfg`, DB)이 아니라 코드에 둔다.
 *
 * 글자(크루 이름·제목·설명)는 운영진이 배포 없이 고치게 팀 설정에 있고(`lib/team-cfg/registry.ts` 의 `brand.*`·`seo.*`),
 * 여기는 **파일이 있어야 성립하는 값**만 담는다. 이미지를 팀 설정에 두려면 업로드 기능이 따로 필요하고, 경로만
 * 설정에 두면 파일 없는 경로를 넣는 순간 깨진 썸네일이 나간다 — 파일과 그 경로는 같은 커밋에 있어야 한다.
 *
 * - 파일은 `public/teams/<team_cd>/` 에 둔다. 새 팀은 폴더 하나 + 이 표 한 줄.
 * - **표에 없는 팀은 썸네일을 안 내보낸다**(다른 팀 이미지로 폴백하지 않는다 — 새 팀 링크에 기강 그림이 뜨면 안 된다).
 * - 이미지는 `public/` 정적 파일이라 CDN 이 그대로 준다(함수 호출 없음). `proxy.ts` matcher 가 `.png` 를 빼므로
 *   쿠키 없는 카톡·네이버 봇도 로그인 리다이렉트 없이 받는다.
 *
 * 2026-11-10: 예전엔 `app/opengraph-image.png` 파일 규칙이라 **모든 주소에 기강 썸네일**이 붙었다. 파일 규칙 이미지는
 * 설정(metadata)보다 우선해서 팀별로 바꿀 수 없어 여기로 옮겼다.
 */

export type TeamOgImage = {
  /** 사이트 루트 기준 경로(`/teams/...`). 절대 주소는 요청 주소로 붙인다(`lib/seo/site-metadata.ts`) */
  path: string;
  width: number;
  height: number;
};

export type TeamSite = {
  /** 링크 미리보기 큰 썸네일(og:image) */
  ogImage?: TeamOgImage;
  /** X(트위터) 카드 이미지. 없으면 `ogImage` 를 쓴다 */
  twitterImage?: TeamOgImage;
  /**
   * 네이버 서치어드바이저 소유확인 코드 — **그 팀 주소에서만** 내보낸다(네이버는 주소마다 따로 확인한다).
   * 환경변수로 빼지 않는다: 어차피 HTML 에 실리는 공개값이고, 환경변수면 Vercel 에 넣는 걸 잊었을 때 태그가 조용히
   * 사라져 소유확인이 실패한다.
   * ⚠ 지우지 마라. 네이버는 1년마다 재확인하는데 태그가 남아 있어야 「소유연장」 한 번으로 끝난다. 없으면 처음부터다.
   *
   * 파일 업로드 방식(`public/naverXXXX.html`)을 안 쓴 이유: `proxy.ts` matcher 가 `.html` 을 제외하지 않아 미들웨어를
   * 타고, `PUBLIC_PATHS` 에 없으면 쿠키 없는 네이버 요청이 /auth/login 으로 302 된다(`llms.txt` 가 겪은 그 함정).
   * 태그는 그 경로를 아예 안 탄다.
   */
  naverSiteVerification?: string;
};

export const TEAM_SITE: Readonly<Record<string, TeamSite>> = {
  gigang: {
    // 크기가 1px 씩 튀는 건 원본 디자인 파일 그대로라서다(1201×631 / 801×401). 다시 뽑을 때 1200×630 으로 맞춘다.
    ogImage: { path: "/teams/gigang/og.png", width: 1201, height: 631 },
    twitterImage: { path: "/teams/gigang/twitter.png", width: 801, height: 401 },
    naverSiteVerification: "1133f48045ef9b8e0f086eae69f7b1e17a5e57d1", // 2026-09-01 발급
  },
  ulsan: {
    // 임시 — 임시 로고(TEAM MOVOF ULSAN 배지)로 기강 썸네일과 같은 틀에 그렸다. 진짜 로고가 오면 이 파일만 바꾼다.
    ogImage: { path: "/teams/ulsan/og.png", width: 1200, height: 630 },
  },
};

export function getTeamSite(teamCd: string): TeamSite {
  return TEAM_SITE[teamCd] ?? {};
}
