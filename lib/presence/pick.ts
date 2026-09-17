/**
 * 화면에 실제로 그릴 접속자를 고른다.
 *
 * 총원은 전광판 라벨(`지금 보는 중 N명`)이 말하므로 공은 분위기만 맡는다.
 */

/**
 * 한 화면에 그리는 공의 최대 개수.
 *
 * **실사용에선 안 걸리는 값이다.** 활동 멤버가 135명(prd 실측)이라 동시 접속이 30을 넘길 일이
 * 사실상 없다 — 그러니 이건 "몇 명까지 보여줄까"가 아니라 **비정상 상황의 뚜껑**이다(익명
 * 방문자나 크롤러가 몰리는 경우 등). 부수적으로 매 프레임 일도 30개로 묶인다.
 *
 * **성능 때문이 아니다.** 30개 transform은 어느 기기에도 부담이 아니다. 공끼리 겹치는 것도
 * 막을 이유가 없다 — 겹쳐 보이는 게 의도고, 층은 `pointer-events-none` + `z-40`이라 FAB·탭바
 * 뒤로 지나가므로 버튼을 가리지도 않는다.
 *
 * 한때 12였다. 사람이 몰리면 공이 들어차 방해가 된다는 이유였는데, 그 전제(공이 화면을 가린다)가
 * 실제와 달라 근거가 성립하지 않았다. 남는 진짜 제약은 **이름표**다 — 공은 겹쳐도 되지만 9px
 * 글자가 여러 개 포개지면 누구인지 못 읽는다. 그마저 30은 실사용에서 안 닿는 수준이다.
 */
export const PRESENCE_RENDER_LIMIT = 30;

/**
 * 선별 규칙은 둘뿐이다.
 *
 * 1. **내가 명단에 있으면 나는 항상 포함한다** — 내 공이 안 보이면 "나는 왜 없지"가 된다.
 * 2. 나머지는 `mem_id` **오름차순**으로 채운다.
 *
 * ⚠️ **결정적이어야 한다.** 랜덤으로 고르면 presence sync가 올 때마다 얼굴이 갈려 깜빡인다.
 * `mem_id`는 안 변하는 값이라 같은 명단이면 항상 같은 얼굴들이 나오고, 바뀌는 건
 * 실제로 누가 들어오거나 나갔을 때뿐이다.
 *
 * presence sync는 객체 키 순회 결과라 **입력 순서가 보장되지 않는다** — 그래서 입력 순서에
 * 기대지 않고 여기서 다시 정렬한다.
 */
export function pickVisiblePresence<T extends { mem_id: string }>(
  list: T[],
  meId: string | null,
  limit: number = PRESENCE_RENDER_LIMIT,
): T[] {
  // presence key가 mem_id라 중복은 원래 안 생기지만, 생기면 같은 공이 둘 그려지고 DOM ref
  // Map이 덮어써져 한쪽이 좌상단에 붙박인다. 들어오는 길을 믿지 않고 여기서 좁힌다.
  const seen = new Map<string, T>();
  for (const item of list) {
    if (!seen.has(item.mem_id)) seen.set(item.mem_id, item);
  }
  const sorted = Array.from(seen.values()).sort((a, b) =>
    a.mem_id < b.mem_id ? -1 : a.mem_id > b.mem_id ? 1 : 0,
  );

  if (sorted.length <= limit) return sorted;

  const mine = meId != null ? seen.get(meId) : undefined;
  if (!mine) return sorted.slice(0, limit);

  // 나를 먼저 확보하고 남은 자리를 앞에서 채운다. 내가 이미 앞쪽에 있으면 그대로 지나가므로
  // 자리를 두 번 쓰지 않는다.
  const rest = sorted.filter((x) => x.mem_id !== meId).slice(0, limit - 1);
  return sorted.filter((x) => x.mem_id === meId || rest.includes(x));
}
