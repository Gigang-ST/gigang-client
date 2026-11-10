import { describe, expect, it } from "vitest";

import { buildSiteMetadata, resolveSiteText, siteOpenGraphBase, type SiteMetaInput } from "@/lib/seo/site-metadata";
import { TEAM_SITE } from "@/lib/team-site";

/** 기강 — 마이그레이션 `20261110111000_team_seo_cfg.sql` 에 넣은 값(옛 `config.ts` 문구 그대로) */
const GIGANG: SiteMetaInput = {
  canonicalOrigin: "https://gigang.team",
  requestOrigin: "https://gigang.team",
  name: "기강",
  title: "기강 러닝크루 | 양재천·강남 러닝 스포츠팀",
  titleSuffix: "기강 러닝크루",
  description: "양재천·강남에서 함께 달리는 러닝크루 기강.",
  slogan: "No time to be weak",
  site: TEAM_SITE.gigang,
};

/** 설정을 하나도 안 채운 새 팀 */
const BLANK: SiteMetaInput = {
  canonicalOrigin: "https://new.gigang.team",
  requestOrigin: "https://new.gigang.team",
  name: null,
  title: null,
  titleSuffix: null,
  description: null,
  slogan: null,
  site: {},
};

type Og = { title?: string; description?: string; siteName?: string; url?: string; images?: { url: string; width: number; height: number }[] };

describe("buildSiteMetadata — 기강은 예전 고정 metadata 와 같은 값", () => {
  it("제목·탭 제목 틀·설명·사이트 이름·대표 주소", () => {
    const m = buildSiteMetadata(GIGANG);
    expect(m.title).toEqual({ default: "기강 러닝크루 | 양재천·강남 러닝 스포츠팀", template: "%s | 기강 러닝크루" });
    expect(m.description).toBe("양재천·강남에서 함께 달리는 러닝크루 기강.");
    expect(m.metadataBase?.toString()).toBe("https://gigang.team/");
    expect(m.alternates?.canonical).toBe("/");
    const og = m.openGraph as Og;
    expect(og).toMatchObject({ title: "기강 러닝크루 | 양재천·강남 러닝 스포츠팀", siteName: "기강", url: "https://gigang.team" });
    expect(m.appleWebApp).toMatchObject({ title: "기강" });
  });

  it("썸네일은 기강 파일, X 카드는 따로 둔 이미지, 네이버 소유확인 태그도 기강에만", () => {
    const m = buildSiteMetadata(GIGANG);
    expect((m.openGraph as Og).images?.[0]).toMatchObject({ url: "https://gigang.team/teams/gigang/og.png", width: 1201, height: 631 });
    expect((m.twitter as { images: string[] }).images).toEqual(["https://gigang.team/teams/gigang/twitter.png"]);
    expect(m.verification?.other?.["naver-site-verification"]).toBe("1133f48045ef9b8e0f086eae69f7b1e17a5e57d1");
  });

  it("탭 아이콘·iOS 아이콘·설치 앱 정보·윈도 타일은 원래 자리(루트) 그대로 — 이미 설치된 기강 앱이 안 깨지게", () => {
    const m = buildSiteMetadata(GIGANG);
    expect(m.icons).toEqual({
      icon: [
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      ],
      apple: [{ url: "/apple-icon-180x180.png", sizes: "180x180", type: "image/png" }],
    });
    expect(m.manifest).toBe("/manifest.webmanifest");
    expect(m.other).toEqual({ "msapplication-config": "/browserconfig.xml" });
  });
});

describe("buildSiteMetadata — 다른 팀", () => {
  it("모보브는 자기 문구·자기 썸네일, 네이버 태그 없음, X 카드는 og 썸네일을 그대로", () => {
    const m = buildSiteMetadata({
      ...GIGANG,
      canonicalOrigin: "https://ulsan.gigang.team",
      requestOrigin: "https://ulsan.gigang.team",
      name: "모보브",
      title: "모보브 MOVOF | 울산 트레일러닝 크루",
      titleSuffix: "모보브",
      description: "울산에서 함께 산을 달리는 트레일러닝 크루 모보브(MOVOF).",
      slogan: "Climb hard Run wild",
      site: TEAM_SITE.ulsan,
    });
    expect(m.title).toEqual({ default: "모보브 MOVOF | 울산 트레일러닝 크루", template: "%s | 모보브" });
    expect((m.openGraph as Og).siteName).toBe("모보브");
    expect((m.openGraph as Og).images?.[0].url).toBe("https://ulsan.gigang.team/teams/ulsan/og.png");
    expect((m.twitter as { images: string[] }).images).toEqual(["https://ulsan.gigang.team/teams/ulsan/og.png"]);
    expect(m).not.toHaveProperty("verification");
    // 아이콘·설치 앱 정보도 자기 폴더 것
    expect(m.manifest).toBe("/teams/ulsan/manifest.webmanifest");
    expect(m.other).toEqual({ "msapplication-config": "/teams/ulsan/browserconfig.xml" });
    expect(JSON.stringify(m.icons)).not.toMatch(/"\/(favicon|apple-icon)/);
    expect(JSON.stringify(m.icons)).toMatch(/\/teams\/ulsan\/favicon-32x32\.png/);
  });

  it("썸네일은 요청 주소로, 대표 주소는 운영 주소로 — dev 에서 공유해도 이미지가 (배포 전) 운영 404 를 안 가리킨다", () => {
    const m = buildSiteMetadata({ ...GIGANG, requestOrigin: "https://dev.gigang.team" });
    expect((m.openGraph as Og).images?.[0].url).toBe("https://dev.gigang.team/teams/gigang/og.png");
    expect((m.openGraph as Og).url).toBe("https://gigang.team");
    expect(m.metadataBase?.toString()).toBe("https://gigang.team/");
  });

  it("아무것도 안 채운 새 팀 — 기강 문구·썸네일로 물러나지 않고 칸째 비운다", () => {
    const m = buildSiteMetadata(BLANK);
    expect(m).not.toHaveProperty("title");
    expect(m).not.toHaveProperty("description");
    const og = m.openGraph as Og;
    expect(og).not.toHaveProperty("siteName");
    expect(og).not.toHaveProperty("images");
    expect(m).not.toHaveProperty("icons");
    expect(m).not.toHaveProperty("manifest");
    expect(JSON.stringify(m)).not.toMatch(/기강|gigang\.team\/teams|favicon|manifest/);
  });
});

describe("resolveSiteText — 빈 칸 물러남", () => {
  it("홈 제목은 크루 이름으로, 탭 제목 뒤 말도 크루 이름으로, 설명은 슬로건으로", () => {
    expect(resolveSiteText({ name: "모보브", title: null, titleSuffix: null, description: null, slogan: "Climb hard Run wild" })).toEqual({
      name: "모보브",
      homeTitle: "모보브",
      titleSuffix: "모보브",
      description: "Climb hard Run wild",
    });
  });

  it("크루 이름이 없어도 탭 제목 뒤 말이 있으면 그걸 홈 제목으로", () => {
    expect(resolveSiteText({ name: null, title: null, titleSuffix: "모보브", description: null, slogan: null }).homeTitle).toBe("모보브");
  });
});

describe("siteOpenGraphBase — openGraph 를 직접 세우는 지면(게시글)이 다시 깔 공통분", () => {
  it("사이트 이름·언어·팀 썸네일", () => {
    expect(siteOpenGraphBase(GIGANG)).toEqual({
      locale: "ko_KR",
      siteName: "기강",
      images: [{ url: "https://gigang.team/teams/gigang/og.png", width: 1201, height: 631, alt: "기강" }],
    });
  });

  it("빈 팀은 언어만", () => {
    expect(siteOpenGraphBase(BLANK)).toEqual({ locale: "ko_KR" });
  });
});
