import type { TeamChannels } from "@/lib/team-channels";
import type { TeamOrganization } from "@/lib/team-site";

/**
 * 조직 구조화 데이터(JSON-LD) — 네이버 「연관 채널」용. **팀마다 따로** 만든다(순수 함수 —
 * 재료 모으기·그리기는 `components/seo/team-json-ld.tsx`, 회귀 테스트 `lib/seo/__tests__/structured-data.test.ts`).
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
 * **네이버 블로그를 만들면 팀 설정 채널에 넣는 것이 가장 값이 크다** — 네이버는 자사
 * 서비스를 우대하고, 연관채널은 그걸 사이트와 잇는 공식 통로다.
 *
 * `sameAs` 는 팀 설정 `social.channels` — 화면의 채널 버튼(`components/social-links.tsx`)과 **같은 출처**라 한쪽만
 * 바뀌지 않는다(예전엔 이 파일에 기강 주소 4개가 따로 박혀 있었다). 이름 변형·지역·종목은 `lib/team-site.ts`.
 */

/** `sameAs` 순서 — 예전 기강 고정 목록과 같은 순서(인스타 → 오픈채팅 → 소모임 → 가민) */
const SAME_AS_ORDER: readonly (keyof TeamChannels)[] = ["instagram", "kakao_open_chat", "somoim", "garmin"];

export type OrganizationJsonLdInput = {
  organization: TeamOrganization;
  /** 팀 정식 운영 주소(`https://gigang.team`) — url·logo·image 를 이걸로 붙인다 */
  canonicalOrigin: string;
  description: string | null;
  channels: TeamChannels;
  logo?: string;
  image?: string;
};

export function buildOrganizationJsonLd(input: OrganizationJsonLdInput) {
  const { organization: org, canonicalOrigin: origin } = input;
  const sameAs = SAME_AS_ORDER.flatMap((key) => (input.channels[key] ? [input.channels[key] as string] : []));
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org.name,
    alternateName: [...org.alternateName],
    url: origin,
    ...(input.logo ? { logo: `${origin}${input.logo}` } : {}),
    ...(input.image ? { image: `${origin}${input.image}` } : {}),
    ...(input.description ? { description: input.description } : {}),
    knowsAbout: [...org.knowsAbout],
    areaServed: { "@type": "Place", name: org.areaServed },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/**
 * JSON-LD를 `<script>`에 넣을 수 있는 문자열로 만든다.
 *
 * `<`를 유니코드로 바꾸는 건 Next.js 공식 가이드의 권고다 — `JSON.stringify`는 XSS에
 * 쓰이는 문자열을 걸러 주지 않아서, 값에 `</script>`가 섞이면 태그가 끊긴다.
 * **지금은 팀 설정(운영진이 넣는 설명·채널 주소)이 여기 실린다** — 이 처리가 빠지면 바로 문제가 되는 자리다.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
