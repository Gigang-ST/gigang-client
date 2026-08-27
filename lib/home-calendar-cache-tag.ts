/**
 * 홈 캘린더 공개 데이터 캐시 태그.
 *
 * `lib/queries/home-calendar.ts` 는 `import "server-only"` 라, 거기서 태그를 가져오면
 * **그 파일 전체가 딸려 온다** — 서버 액션 단위 테스트(vitest, node 환경)가
 * `Cannot find package 'server-only'` 로 죽는다. 실제로 그렇게 깨뜨린 적이 있다.
 *
 * 그래서 태그 문자열만 의존성 없는 모듈로 떼어 둔다 — `lib/common-codes-cache-tag.ts` 와
 * 같은 이유·같은 모양이다.
 */
export const HOME_CALENDAR_CACHE_TAG = "home-calendar";
