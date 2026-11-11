import { GIGANG_LLMS_TXT } from "@/lib/seo/llms/gigang";
import { TEAM_LOGO } from "@/lib/team-logo";

/**
 * 팀별 **정적 파일·주소에 묶인 값** — 배포와 함께 나가는 것들이라 팀 설정(`team_cfg`, DB)이 아니라 코드에 둔다.
 *
 * 글자(크루 이름·제목·설명)는 운영진이 배포 없이 고치게 팀 설정에 있고(`lib/team-cfg/registry.ts` 의 `brand.*`·`seo.*`),
 * 여기는 **파일이 있어야 성립하는 값**만 담는다. 이미지를 팀 설정에 두려면 업로드 기능이 따로 필요하고, 경로만
 * 설정에 두면 파일 없는 경로를 넣는 순간 깨진 썸네일이 나간다 — 파일과 그 경로는 같은 커밋에 있어야 한다.
 *
 * - 새 팀 파일은 `public/teams/<team_cd>/` 에 둔다(이 폴더는 proxy 를 안 탄다 — `proxy.ts` matcher). 새 팀 = 폴더 + 이 표 한 줄.
 * - **기강 아이콘·manifest 는 원래 자리(루트)에 그대로 둔다.** 이미 설치된 기강 앱·윈도 타일·알림이 그 주소를
 *   들고 있어서, 옮기면 업데이트 전까지 아이콘이 깨진다. 썸네일만 `/teams/gigang/` 으로 옮겼다(파일 규칙에서 빼야 해서).
 * - **표에 없는 칸은 안 내보낸다**(다른 팀 파일로 폴백하지 않는다 — 새 팀에 기강 그림이 뜨면 안 된다).
 * - 전부 `public/` 정적 파일이라 CDN 이 그대로 준다(함수 호출 없음).
 *
 * 2026-11-10: 예전엔 `app/opengraph-image.png`·`app/manifest.ts`·레이아웃 아이콘이 고정이라 **모든 주소가 기강**이었다.
 * 울산(모보브) 파일은 전부 임시 로고(TEAM MOVOF ULSAN 배지)로 만든 것 — 진짜 로고가 오면 같은 이름으로 바꿔 끼운다.
 */

export type TeamOgImage = {
  /** 사이트 루트 기준 경로(`/teams/...`). 절대 주소는 요청 주소로 붙인다(`lib/seo/site-metadata.ts`) */
  path: string;
  width: number;
  height: number;
};

export type TeamIcon = { url: string; sizes: string };

/**
 * 구조화 데이터(JSON-LD) 중 **팀 설정에 없는 값**. 이름 변형·활동 지역·종목은 검색엔진에게 "이 크루가 누구인가"를
 * 못박는 값이라 한 번 정하면 거의 안 바뀐다. 설명은 팀 설정 `seo.description`, 공식 채널(`sameAs`)은 팀 설정
 * `social.channels` 에서 읽는다 — 화면의 채널 버튼과 같은 출처라 한쪽만 바뀌지 않는다.
 */
export type TeamOrganization = {
  /** 정식 이름 — 크루 이름(`brand.name`)보다 길게. 「기강」 단독은 동음이의어라 검색엔진이 못 가른다 */
  name: string;
  alternateName: readonly string[];
  knowsAbout: readonly string[];
  areaServed: string;
};

export type TeamSite = {
  /** 링크 미리보기 큰 썸네일(og:image) */
  ogImage?: TeamOgImage;
  /** X(트위터) 카드 이미지. 없으면 `ogImage` 를 쓴다 */
  twitterImage?: TeamOgImage;
  /** 브라우저 탭 아이콘 */
  favicons?: readonly TeamIcon[];
  /** iOS 홈 화면 아이콘 */
  appleIcons?: readonly TeamIcon[];
  /**
   * 설치 앱 정보(이름·아이콘). **정적 파일**이다 — 브라우저가 화면을 열 때마다 받아 가는 파일이라 서버 함수로 만들면
   * 요청 수만큼 함수 호출이 는다(Vercel 무료 한도, AGENTS.md). 그래서 앱 이름은 팀 설정 `brand.name` 을 따르지 않고
   * 이 파일에 적혀 있다 — 크루 이름을 바꾸면 이 파일도 같이 고친다.
   */
  manifest?: string;
  /** 윈도 시작 화면 타일 설정(`browserconfig.xml`) */
  msTileConfig?: string;
  /** 푸시 알림 — 큰 아이콘(컬러)·상태바 배지(흰 실루엣 + 투명 배경). `lib/push/send-push.ts` 가 페이로드에 싣는다 */
  notificationIcon?: string;
  notificationBadge?: string;
  /** 로고 원본(투명 배경) — 구조화 데이터 `logo`. 경로의 정본은 `lib/team-logo.ts`(화면 안 로고와 같은 그림) */
  logo?: string;
  /** `/llms.txt` 본문(LLM·에이전트용 사이트 안내문). 없으면 그 주소의 `/llms.txt` 는 404 — `app/llms.txt/route.ts` */
  llmsTxt?: string;
  organization?: TeamOrganization;
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

const ulsan = (file: string) => `/teams/ulsan/${file}`;

export const TEAM_SITE: Readonly<Record<string, TeamSite>> = {
  gigang: {
    // 크기가 1px 씩 튀는 건 원본 디자인 파일 그대로라서다(1201×631 / 801×401). 다시 뽑을 때 1200×630 으로 맞춘다.
    ogImage: { path: "/teams/gigang/og.png", width: 1201, height: 631 },
    twitterImage: { path: "/teams/gigang/twitter.png", width: 801, height: 401 },
    favicons: [
      { url: "/favicon-16x16.png", sizes: "16x16" },
      { url: "/favicon-32x32.png", sizes: "32x32" },
      { url: "/favicon-96x96.png", sizes: "96x96" },
    ],
    appleIcons: [{ url: "/apple-icon-180x180.png", sizes: "180x180" }],
    manifest: "/manifest.webmanifest",
    msTileConfig: "/browserconfig.xml",
    notificationIcon: "/GIGANG.png",
    notificationBadge: "/notification-badge.png",
    logo: TEAM_LOGO.gigang.logo,
    organization: {
      name: "기강 러닝크루",
      alternateName: ["기강", "기강 스포츠팀", "양재천 러닝크루 기강"],
      knowsAbout: ["러닝", "자전거", "수영", "마라톤", "트레일러닝"],
      areaServed: "서울 양재천·강남 일대",
    },
    llmsTxt: GIGANG_LLMS_TXT,
    naverSiteVerification: "1133f48045ef9b8e0f086eae69f7b1e17a5e57d1", // 2026-09-01 발급
  },
  ulsan: {
    ogImage: { path: ulsan("og.png"), width: 1200, height: 630 },
    // 16·32 는 배지 글자가 뭉개져 산 모양만, 나머지는 배지 전체
    favicons: [
      { url: ulsan("favicon-16x16.png"), sizes: "16x16" },
      { url: ulsan("favicon-32x32.png"), sizes: "32x32" },
      { url: ulsan("favicon-96x96.png"), sizes: "96x96" },
    ],
    appleIcons: [{ url: ulsan("apple-icon-180x180.png"), sizes: "180x180" }],
    manifest: ulsan("manifest.webmanifest"),
    msTileConfig: ulsan("browserconfig.xml"),
    notificationIcon: ulsan("notification-icon.png"),
    notificationBadge: ulsan("notification-badge.png"),
    logo: TEAM_LOGO.ulsan.logo,
    organization: {
      name: "모보브 트레일러닝 크루",
      alternateName: ["모보브", "MOVOF", "울산 트레일러닝 크루 모보브"],
      knowsAbout: ["트레일러닝", "등산", "러닝"],
      areaServed: "울산 일대",
    },
  },
};

export function getTeamSite(teamCd: string): TeamSite {
  return TEAM_SITE[teamCd] ?? {};
}
