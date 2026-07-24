/**
 * 종이비행기 한마디의 수명 — **24시간.** 인스타 스토리처럼 하루가 지나면 하늘에서 사라진다.
 *
 * 각오(`lib/story-pledge.ts`)와 혼동하지 말 것: 각오는 팻말에 꽂혀 **만료 없이** 남고 1인
 * 1개다. 한마디는 비행기가 싣고 24시간 뒤 내려가며 1인 여러 개다. 형태(팻말/비행기)로
 * 구분되는 만큼 규칙도 다르다.
 *
 * 화면에서 사라질 뿐 **행은 지우지 않는다** — 화면에서 빼는 것과 데이터를 없애는 건 다른
 * 일이다. 만료 판정은 서버 RPC(`get_team_messages`)와 이 함수가 같은 24시간을 쓴다.
 */
export const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;

/** 한마디가 내려가기까지 남은 ms — 0 이하면 만료(하늘에서 뺀다) */
export function messageRemainMs(crtAt: string, nowMs: number): number {
  return new Date(crtAt).getTime() + MESSAGE_TTL_MS - nowMs;
}

/**
 * 배너에 붙는 남은 시간 — 날린 순간 `24:00:00`에서 시작해 줄어든다.
 *
 * 예전 비행 시계(`floatClock`)와 방향이 반대다: 저건 "얼마나 떠 있었나"라 올라갔지만,
 * 한마디는 "얼마나 남았나"라 내려간다. 사라지는 게 규칙이면 남은 시간이 정보다.
 *
 * 만료 후에도 `00:00:00`을 돌려준다(음수로 흐르지 않게 바닥을 둔다). 만료된 배너를 하늘에서
 * 빼는 건 호출부의 몫이다 — 시계는 표기만 책임진다.
 */
export function messageCountdown(crtAt: string, nowMs: number): string {
  const total = Math.max(0, Math.floor(messageRemainMs(crtAt, nowMs) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
