/**
 * 칭호획득 리드 슬롯 표시 상수·헬퍼 — **클라이언트가 읽어도 되는 것만** 둔다.
 *
 * 조회 쪽(`lib/queries/story-titles.ts`)은 `createAdminClient`를 타고 `server-only`에
 * 닿는 서버 모듈이라 여기와 분리한다(`lib/story-post.ts`와 같은 이유 — 상수 하나만
 * 가져와도 클라이언트 번들이 서버 모듈을 통째로 끌어와 브라우저에서 터진다).
 *
 * 설계 문서: docs/superpowers/specs/2026-08-07-칭호획득-리드슬롯-design.md
 */

/** 한 화면에 보여줄 칭호 줄 수 — 264px 슬롯 예산에 맞춘 값(스펙 §264px 예산) */
export const TITLE_LEDE_PAGE = 3;

/**
 * 한 줄에 보여줄 얼굴 수 — 넘치는 인원은 `외 N`으로 줄인다.
 * 한 칭호는 무조건 한 줄이다(줄바꿈하면 3줄 예산이 무너진다).
 * xs 아바타(24px) 5개 + 배지가 375px 본문 폭(≈287px)에 들어가는 값.
 */
export const TITLE_ROW_FACES = 5;

/** `get_team_recent_title_grants` RPC의 획득자 한 명 */
export type RecentTitleGrantPerson = {
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  grnt_at: string;
};

/** `get_team_recent_title_grants` RPC의 칭호 한 줄 — 최근 30일 획득자 묶음(최신순) */
export type RecentTitleRow = {
  ttl_id: string;
  ttl_nm: string;
  ttl_desc: string | null;
  desc_visibility: "always" | "others" | "held" | "never";
  /** 이 칭호의 가장 최근 수여 시각 — RPC 정렬 기준(내림차순) */
  last_grnt_at: string;
  grants: RecentTitleGrantPerson[];
};

/**
 * 칭호획득 슬롯의 진입 회전 오프셋을 뽑는다(0 ~ count-1). count가 0/1이면 0.
 *
 * 서버 컴포넌트 렌더에서 `Math.random()`을 직접 부르면 렌더 순수성 룰에 걸린다 —
 * `pickRandomPostIndex`(lib/story-post.ts)와 같은 이유로 헬퍼로 빼 둔다.
 */
export function pickTitleLedeStart(count: number): number {
  if (count <= 1) return 0;
  return Math.floor(Math.random() * count);
}

/**
 * pick만큼 회전한 뒤 앞 `TITLE_LEDE_PAGE`개 — 칭호획득 슬롯의 "이번 바퀴 페이지".
 *
 * **랜덤(셔플)이 아니라 회전이다.** 셔플이면 운 나쁘게 같은 칭호만 반복 노출되고
 * 누군가는 몇 바퀴를 돌아도 안 나올 수 있다(리드의 rotate 원칙과 동일 —
 * story-lede.tsx의 rotate 주석 참조). 한 바퀴 완주마다 호출자가 pick을
 * `TITLE_LEDE_PAGE`씩 키우면(페이지 전진) 모든 칭호가 빠짐없이 주기적으로 오른다.
 */
export function rotateTitlePage<T>(arr: T[], pick: number): T[] {
  if (arr.length === 0) return [];
  const at = ((pick % arr.length) + arr.length) % arr.length;
  return [...arr.slice(at), ...arr.slice(0, at)].slice(0, TITLE_LEDE_PAGE);
}
