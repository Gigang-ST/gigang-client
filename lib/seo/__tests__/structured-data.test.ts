import { describe, expect, it } from "vitest";

import { buildOrganizationJsonLd, jsonLdScript } from "@/lib/seo/structured-data";
import { TEAM_SITE } from "@/lib/team-site";

const GIGANG_CHANNELS = {
  garmin: "https://connect.garmin.com/app/group/4857390",
  somoim: "https://www.somoim.co.kr/3beed52a-0620-11ef-a71d-0aebcbdc4a071",
  instagram: "https://www.instagram.com/team_gigang",
  kakao_open_chat: "https://open.kakao.com/o/grnMFGng",
};

describe("buildOrganizationJsonLd", () => {
  it("기강은 예전 고정 상수와 같은 값 — 채널은 팀 설정에서 와도 순서는 인스타 → 오픈채팅 → 소모임 → 가민", () => {
    const site = TEAM_SITE.gigang;
    expect(
      buildOrganizationJsonLd({
        organization: site.organization!,
        canonicalOrigin: "https://gigang.team",
        description: "양재천·강남에서 함께 달리는 러닝크루 기강.",
        channels: GIGANG_CHANNELS,
        logo: site.logo,
        image: site.ogImage?.path,
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "기강 러닝크루",
      alternateName: ["기강", "기강 스포츠팀", "양재천 러닝크루 기강"],
      url: "https://gigang.team",
      logo: "https://gigang.team/logo.webp",
      image: "https://gigang.team/teams/gigang/og.png",
      description: "양재천·강남에서 함께 달리는 러닝크루 기강.",
      knowsAbout: ["러닝", "자전거", "수영", "마라톤", "트레일러닝"],
      areaServed: { "@type": "Place", name: "서울 양재천·강남 일대" },
      sameAs: [
        "https://www.instagram.com/team_gigang",
        "https://open.kakao.com/o/grnMFGng",
        "https://www.somoim.co.kr/3beed52a-0620-11ef-a71d-0aebcbdc4a071",
        "https://connect.garmin.com/app/group/4857390",
      ],
    });
  });

  it("모보브는 자기 이름·주소·채널 — 채널이 없으면 sameAs 를 안 싣는다", () => {
    const site = TEAM_SITE.ulsan;
    const ld = buildOrganizationJsonLd({
      organization: site.organization!,
      canonicalOrigin: "https://ulsan.gigang.team",
      description: null,
      channels: {},
      logo: site.logo,
      image: site.ogImage?.path,
    });
    expect(ld).toMatchObject({ name: "모보브 트레일러닝 크루", url: "https://ulsan.gigang.team", logo: "https://ulsan.gigang.team/teams/ulsan/logo.png" });
    expect(ld).not.toHaveProperty("sameAs");
    expect(ld).not.toHaveProperty("description");
    expect(JSON.stringify(ld)).not.toMatch(/기강|gigang\.team\/(?!teams\/ulsan)/);
  });
});

describe("jsonLdScript", () => {
  it("`<` 를 \\u003c 로 바꿔 </script> 로 태그가 끊기지 않게 한다 — 운영진이 넣는 설명이 실린다", () => {
    const out = jsonLdScript({ description: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ description: "</script><script>alert(1)</script>" });
  });
});
