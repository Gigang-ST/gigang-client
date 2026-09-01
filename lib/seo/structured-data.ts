import { SITE_URL, siteContent } from "@/config";

/**
 * 조직 구조화 데이터(JSON-LD).
 *
 * 본문 텍스트만으로는 "기강"이라는 두 글자가 크루 이름인지 보통명사인지 기계가
 * 못 가른다 — 실제로 `기강스포츠팀`을 검색하면 "대표팀 기강 확립" 류 뉴스가 나온다
 * (2026-09-01 확인). `sameAs`로 공식 SNS를 묶어 주면 같은 주체임을 못박을 수 있다.
 *
 * `sameAs` 링크는 `components/social-links.tsx`가 화면에 그리는 것과 같은 곳이다 —
 * 한쪽을 바꾸면 다른 쪽도 맞춰야 한다.
 */
export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SportsOrganization",
  name: "기강 러닝크루",
  alternateName: ["기강", "기강 스포츠팀", "양재천 러닝크루 기강"],
  url: SITE_URL,
  logo: `${SITE_URL}/logo.webp`,
  image: `${SITE_URL}/opengraph-image.png`,
  description: siteContent.metadata.description,
  sport: ["러닝", "자전거", "수영"],
  areaServed: {
    "@type": "Place",
    name: "서울 양재천·강남 일대",
  },
  sameAs: [
    "https://www.instagram.com/team_gigang",
    "https://open.kakao.com/o/grnMFGng",
    "https://www.somoim.co.kr/3beed52a-0620-11ef-a71d-0aebcbdc4a071",
    "https://connect.garmin.com/app/group/4857390",
  ],
} as const;
