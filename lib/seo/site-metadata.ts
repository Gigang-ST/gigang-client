import type { Metadata } from "next";

import type { TeamOgImage, TeamSite } from "@/lib/team-site";

/**
 * 사이트 공통 메타데이터(링크 미리보기·탭 제목·검색결과)를 **팀 기준으로** 만든다. 순수 함수 —
 * 값 모으기(요청 주소·팀 설정)는 `lib/queries/site-metadata.ts`, 회귀 테스트는 `lib/seo/__tests__/site-metadata.test.ts`.
 *
 * 2026-11-10 전에는 `app/layout.tsx` 의 고정 `metadata`(기강 문구) + `app/opengraph-image.png` 라서 울산 링크를 공유해도
 * 「기강 러닝크루 | 양재천·강남…」 제목에 기강 썸네일이 떴다.
 *
 * 비어 있는 칸의 물러남 — **다른 팀 값으로는 절대 안 물러난다**(설정을 안 채운 새 팀에 기강 문구가 뜨지 않게):
 * - 홈 제목 = `seo.title` → 크루 이름 → 탭 제목 뒤 말
 * - 탭 제목 뒤 말 = `seo.title_suffix` → 크루 이름
 * - 설명 = `seo.description` → 슬로건
 * - 썸네일 = 팀 파일 표(`lib/team-site.ts`)에 있을 때만
 */

export type SiteMetaInput = {
  /** 팀의 정식 운영 주소(`https://gigang.team`) — canonical·og:url 기준. dev 에서 열어도 운영 주소를 가리킨다(예전과 같음) */
  canonicalOrigin: string | null;
  /**
   * 지금 요청이 들어온 주소 — **이미지 절대 주소**에만 쓴다. 이미지를 운영 주소로 붙이면 dev·미리보기에서 공유한 링크의
   * 썸네일이 (아직 배포 전이라) 운영에 없는 파일을 가리켜 빈 칸이 된다(모임 카드가 2026-09-23 dev 에서 겪었다).
   */
  requestOrigin: string | null;
  name: string | null;
  title: string | null;
  titleSuffix: string | null;
  description: string | null;
  slogan: string | null;
  site: TeamSite;
};

export type SiteText = {
  name: string | null;
  homeTitle: string | null;
  titleSuffix: string | null;
  description: string | null;
};

export function resolveSiteText(input: Pick<SiteMetaInput, "name" | "title" | "titleSuffix" | "description" | "slogan">): SiteText {
  const titleSuffix = input.titleSuffix ?? input.name;
  return {
    name: input.name,
    homeTitle: input.title ?? input.name ?? titleSuffix,
    titleSuffix,
    description: input.description ?? input.slogan,
  };
}

function absolute(path: string, origin: string | null): string {
  return origin ? `${origin}${path}` : path;
}

function toOgImage(img: TeamOgImage, origin: string | null, alt: string | null) {
  return { url: absolute(img.path, origin), width: img.width, height: img.height, ...(alt ? { alt } : {}) };
}

/**
 * 팀 썸네일 — 사이트 공통 미리보기와 **자기 og 를 따로 세우는 지면**(게시글 등)이 같이 쓴다.
 * Next 는 하위 지면이 `openGraph` 를 세우면 부모 것을 통째로 갈아 끼워서, 그 지면은 이미지를 직접 다시 넣어야 한다.
 */
export function siteOgImages(site: TeamSite, requestOrigin: string | null, alt: string | null) {
  const og = site.ogImage ? [toOgImage(site.ogImage, requestOrigin, alt)] : [];
  const tw = site.twitterImage ?? site.ogImage;
  const twitter = tw ? [absolute(tw.path, requestOrigin)] : [];
  return { og, twitter };
}

/** 하위 지면의 openGraph 에 깔 공통분(사이트 이름·언어·썸네일). 지면이 자기 이미지를 주면 그걸로 덮는다 */
export function siteOpenGraphBase(input: SiteMetaInput) {
  const text = resolveSiteText(input);
  const images = siteOgImages(input.site, input.requestOrigin, text.name);
  return {
    locale: "ko_KR",
    ...(text.name ? { siteName: text.name } : {}),
    ...(images.og.length ? { images: images.og } : {}),
  };
}

/** 루트 레이아웃이 내보내는 팀 메타데이터. 팀과 무관한 고정분(아이콘 등)은 레이아웃이 들고 있다 */
export function buildSiteMetadata(input: SiteMetaInput): Metadata {
  const text = resolveSiteText(input);
  const images = siteOgImages(input.site, input.requestOrigin, text.name);
  const ogUrl = input.canonicalOrigin ?? input.requestOrigin;

  return {
    ...(input.canonicalOrigin ? { metadataBase: new URL(input.canonicalOrigin) } : {}),
    /**
     * `default`는 홈 제목, `template`은 하위 지면 제목이다.
     * 지면마다 제목이 갈려야 검색결과에서 서로 다른 문서로 잡힌다 — 전 지면이 크루 이름 하나를 쓰면
     * 중복 문서로 묶여 색인에서 밀린다.
     */
    ...(text.homeTitle
      ? { title: { default: text.homeTitle, template: text.titleSuffix ? `%s | ${text.titleSuffix}` : "%s" } }
      : {}),
    ...(text.description ? { description: text.description } : {}),
    /** 홈의 대표 URL. www 호스트로 들어와도 apex 한 곳으로 모은다. */
    alternates: { canonical: "/" },
    ...(input.site.naverSiteVerification
      ? { verification: { other: { "naver-site-verification": input.site.naverSiteVerification } } }
      : {}),
    openGraph: {
      ...(text.homeTitle ? { title: text.homeTitle } : {}),
      ...(text.description ? { description: text.description } : {}),
      ...(text.name ? { siteName: text.name } : {}),
      ...(ogUrl ? { url: ogUrl } : {}),
      locale: "ko_KR",
      type: "website",
      ...(images.og.length ? { images: images.og } : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(text.homeTitle ? { title: text.homeTitle } : {}),
      ...(text.description ? { description: text.description } : {}),
      ...(images.twitter.length ? { images: images.twitter } : {}),
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      ...(text.name ? { title: text.name } : {}),
    },
    ...siteIconMetadata(input.site),
  };
}

/** 탭 아이콘·iOS 홈 화면 아이콘·설치 앱 정보·윈도 타일 — 팀 파일 표에 있는 것만 */
function siteIconMetadata(site: TeamSite): Metadata {
  const favicons = site.favicons ?? [];
  const apple = site.appleIcons ?? [];
  return {
    ...(favicons.length || apple.length
      ? {
          icons: {
            ...(favicons.length ? { icon: favicons.map((i) => ({ ...i, type: "image/png" })) } : {}),
            ...(apple.length ? { apple: apple.map((i) => ({ ...i, type: "image/png" })) } : {}),
          },
        }
      : {}),
    ...(site.manifest ? { manifest: site.manifest } : {}),
    ...(site.msTileConfig ? { other: { "msapplication-config": site.msTileConfig } } : {}),
  };
}
