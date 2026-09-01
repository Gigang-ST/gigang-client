import { SITE_URL, siteContent } from "@/config";

/**
 * 조직 구조화 데이터(JSON-LD) — 네이버 「연관 채널」용.
 *
 * 본문 텍스트만으로는 "기강"이라는 두 글자가 크루 이름인지 보통명사인지 기계가 못 가른다
 * (`기강스포츠팀`을 검색하면 "대표팀 기강 확립" 류 뉴스가 나온다, 2026-09-01 확인).
 * `sameAs`로 공식 채널을 묶어 주면 같은 주체임을 못박을 수 있다.
 *
 * ⚠ `@type`을 `SportsOrganization`으로 두지 마라. 네이버 웹마스터 가이드(사이트 품질향상
 * 가이드 p.23)의 연관채널 예제는 **`Organization` 또는 `Person`** 이고, 그 채널정보가
 * PC·모바일 검색결과에 노출된다고 명시돼 있다. `SportsOrganization`은 schema.org 상
 * `Organization`의 하위 타입이지만 네이버 파서가 하위 타입까지 받아 준다는 근거가 없다.
 * 반대로 구글은 하위 타입이라고 더 주는 게 없다 — 잃을 게 없으니 문서에 적힌 형태로 간다.
 * (그래서 `sport` 대신 `Organization`에도 유효한 `knowsAbout`을 쓴다.)
 *
 * 발급된 채널은 서치어드바이저 [요청 > 채널 제출]에서 한 번 더 제출해야 한다.
 * **네이버 블로그를 만들면 여기 `sameAs`에 넣는 것이 가장 값이 크다** — 네이버는 자사
 * 서비스를 우대하고, 연관채널은 그걸 사이트와 잇는 공식 통로다.
 *
 * `sameAs` 링크는 `components/social-links.tsx`가 화면에 그리는 것과 같은 곳이다 —
 * 한쪽을 바꾸면 다른 쪽도 맞춰야 한다.
 */
export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "기강 러닝크루",
  alternateName: ["기강", "기강 스포츠팀", "양재천 러닝크루 기강"],
  url: SITE_URL,
  logo: `${SITE_URL}/logo.webp`,
  image: `${SITE_URL}/opengraph-image.png`,
  description: siteContent.metadata.description,
  knowsAbout: ["러닝", "자전거", "수영", "마라톤", "트레일러닝"],
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

/**
 * JSON-LD를 `<script>`에 넣을 수 있는 문자열로 만든다.
 *
 * `<`를 유니코드로 바꾸는 건 Next.js 공식 가이드의 권고다 — `JSON.stringify`는 XSS에
 * 쓰이는 문자열을 걸러 주지 않아서, 값에 `</script>`가 섞이면 태그가 끊긴다.
 * 지금 넣는 값은 전부 이 파일의 상수라 위험하지 않지만, 나중에 DB에서 온 값
 * (모임 이름·회원 이름 따위)을 여기 태우는 순간 바로 문제가 되는 자리다.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\u003c");
}
