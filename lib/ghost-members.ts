import { parseEventTime, todayKST } from "@/lib/dayjs";

import type { GhostMember } from "@/lib/queries/ghost-members";

/**
 * 현상수배 존의 순수 로직 — 조회(`lib/queries/ghost-members.ts`)와 분리해 테스트 가능하게 둔다
 * (`lib/story-pledge.ts`·`lib/story-post.ts`와 같은 자리).
 *
 * **왜 갈랐나**: 후보를 고르는 조건("100일 이상 안 나온 활동 멤버")은 시드와 무관한데,
 * 예전엔 순서까지 RPC가 정하느라 **시드가 인자로 들어가 캐시를 못 걸었다**. 필터는 캐시하고
 * 순서만 여기서 정하면 둘 다 얻는다 — 진입마다 새 조합이 나오면서 DB는 하루 한 번만 본다.
 */

/** 지면에 세우는 최대 인원 — 이름표가 포개져 못 읽히는 걸 막는 상한 */
export const GHOST_DISPLAY_LIMIT = 30;

/**
 * 문자열 → 32비트 정수. `lib/story-presence.ts`의 `hashId`와 같은 계열(FNV-1a)이다.
 *
 * md5를 안 쓴다: 이 값은 **정렬 키로만** 쓰여 암호학적 성질이 필요 없고, `node:crypto`를
 * 끌어오면 이 모듈이 순수하지 않게 되어 테스트가 무거워진다.
 */
function hashKey(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 며칠째 안 보이는가 — **캐시가 아니라 화면 그리는 시점의 KST로 센다.**
 *
 * RPC도 `days_ago`를 주지만 그 값은 **조회 시점**의 날짜로 계산된 것이라, 하루 캐시에 담기면
 * 그만큼 낡는다("103일째"가 다음 날에도 103일째로 보인다). 후보 명단이 하루 묵는 건 무해해도
 * (100일 기준이라 한두 명 차이) 화면에 찍히는 숫자가 틀린 건 다른 문제다.
 * AGENTS.md의 KST 규칙 — **날짜 차이는 양쪽 다 KST로, 상대편 date 문자열은 `parseEventTime`**.
 */
export function daysAgoKST(lastActvDt: string, today: string = todayKST()): number {
  const diff = parseEventTime(today).diff(parseEventTime(lastActvDt), "day");
  return Math.max(0, diff);
}

/**
 * 지면에 세울 순서로 정리한다 — **시드 고정 셔플 + 일수 재계산 + 상한**.
 *
 * 같은 시드면 항상 같은 순서다. 그래서 한 진입 안에서 재조회가 나도 가로 스크롤 도중
 * 얼굴이 안 바뀌고, 시드가 바뀌면(=다음 진입) 조합이 새로 뽑힌다. 예전 RPC의
 * `ORDER BY md5(mem_id || seed)`가 하던 일을 그대로 옮겨 온 것이다.
 *
 * 동점(해시 충돌)은 `mem_id`로 가른다 — 안 그러면 정렬이 불안정해져 같은 시드인데도
 * 순서가 흔들릴 수 있다.
 */
export function arrangeGhosts(
  rows: GhostMember[],
  seed: string,
  today: string = todayKST(),
): GhostMember[] {
  return [...rows]
    .sort((a, b) => {
      // ⚠️ **시드를 앞에 붙인다** (`seed + mem_id`, 반대로 하면 안 된다).
      // FNV-1a는 바이트를 순서대로 섞는데, 시드가 뒤에 오면 마지막 한 바이트만 다른 상태로
      // 끝나 **시드를 바꿔도 상대 순서가 그대로 유지된다** — 실제로 "seed-1"과 "seed-2"가
      // 똑같은 순서를 냈다(회귀 테스트가 잡았다). 앞에 두면 시드가 초기 상태를 갈라놓고
      // 그 위에서 id가 여러 라운드 섞인다.
      const ha = hashKey(seed + a.mem_id);
      const hb = hashKey(seed + b.mem_id);
      return ha === hb ? a.mem_id.localeCompare(b.mem_id) : ha - hb;
    })
    .slice(0, GHOST_DISPLAY_LIMIT)
    .map((g) => ({ ...g, days_ago: daysAgoKST(g.last_actv_dt, today) }));
}
