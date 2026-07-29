import SchedulePage from "./schedule/page";
import StoryPage from "./story/page";

/**
 * 홈(`/`)에 무엇을 그릴지 고르는 스위치 — **이 한 줄만 바꾸면 홈이 교체된다.**
 *
 * 리다이렉트가 아니다. `/`에서 고른 페이지를 **그대로 그린다**(요청 1회, 주소창 그대로).
 * `/schedule`·`/story`는 각자의 주소로도 계속 살아 있어서, 홈을 바꿔도 옛 링크가 죽지 않는다.
 * 파일을 옮기지 않으므로 롤백도 이 상수만 되돌리면 끝이다.
 *
 * 홈을 바꿀 때 **탭바(`components/bottom-tab-bar.tsx`)도 함께 손봐야 한다** — 탭 두 개가
 * 같은 화면을 가리키면 하나가 죽은 탭이 된다. 아래 표 대로 맞춘다.
 *
 * | HOME_PAGE   | 홈에 그려지는 것 | 탭바에서 `/`를 가리킬 탭 | 다른 탭이 가리킬 곳 |
 * |-------------|------------------|--------------------------|---------------------|
 * | `"story"`   | 전광판           | 가운데 로고 탭           | 일정 탭 → `/schedule` |
 * | `"schedule"`| 달력             | 일정 탭                  | 로고 탭 → `/story`    |
 */
const HOME_PAGE: "story" | "schedule" = "story";

export default HOME_PAGE === "story" ? StoryPage : SchedulePage;
