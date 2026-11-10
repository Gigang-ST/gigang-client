/**
 * 기강 정규 도메인. 사이트맵·robots·조직 구조화 데이터(JSON-LD)가 이 값으로 절대 URL 을 만든다.
 *
 * ⚠ 기강 전용이다 — robots·sitemap·JSON-LD 는 아직 팀별로 안 나뉘었다(울산 주소에서도 기강 주소를 가리킨다).
 * 링크 미리보기·탭 제목·canonical 은 2026-11-10 팀별로 옮겼다 — 팀 정식 주소는 `lib/team-host.ts` 의
 * `canonicalTeamHost()`, 문구는 팀 설정(`brand.name`·`seo.*`), 썸네일·네이버 소유확인은 `lib/team-site.ts`.
 * 예전 이 파일의 `siteContent`(기강 제목·설명)와 네이버 소유확인 코드는 그쪽으로 옮겼다.
 */
export const SITE_URL = "https://gigang.team";
