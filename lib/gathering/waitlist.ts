/**
 * 모임 대기열 — 순번·표시 규칙의 정본.
 * 설계: docs/superpowers/specs/2026-09-10-모임-대기열-design.md §2·§9
 *
 * 여기엔 **승급 가능 여부 판정이 없다.** 그건 promote_gthr_waitlist(plpgsql)가
 * 트랜잭션 안에서 정하는 일이고, 화면용으로 한 벌 더 만들면 진실이 둘이 된다.
 * 이 파일은 "서버가 준 사실을 어떻게 보여줄까"만 다룬다.
 */

/** 내가 이 모임에 대해 갖는 상태. 버튼·안내 문구가 전부 이 셋으로 갈린다. */
export type AttendState = "attending" | "waiting" | "none";

/** 대기 명단 한 줄이 최소한 갖춰야 하는 모양(순번 계산에 필요한 것만). */
export type WaitEntry = { mem_id: string; wait_at: string };

/**
 * 대기 명단을 순번순으로 정렬한다.
 *
 * 정렬 키가 `wait_at`인 이유가 이 기능의 핵심이다 — 참석 → 취소 → (만석) → 재신청이면
 * DB가 `wait_at`을 now()로 갱신해 맨 뒤로 보낸다. `crt_at`으로 정렬하면 그 사람이
 * 처음 줄 섰던 자리를 물고 새치기한다.
 *
 * 동시각 타이는 `mem_id`로 가른다 — 안 그러면 렌더할 때마다 순서가 흔들린다.
 * 원본 배열은 건드리지 않는다(서버 컴포넌트가 넘긴 props를 그 자리에서 뒤집지 않게).
 */
export function sortWaitlist<T extends WaitEntry>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) => a.wait_at.localeCompare(b.wait_at) || a.mem_id.localeCompare(b.mem_id),
  );
}

/** 대기 순번(1-based). 명단에 없으면 null. 입력이 정렬돼 있지 않아도 된다. */
export function waitRankOf(entries: WaitEntry[], memId: string): number | null {
  const idx = sortWaitlist(entries).findIndex((e) => e.mem_id === memId);
  return idx === -1 ? null : idx + 1;
}

/**
 * 참석·대기 플래그를 한 상태로 좁힌다.
 * 참석이 대기를 이긴다 — 승급 직후 대기 행이 아직 안 닫힌 찰나에도 "참석"으로 보여야 한다.
 */
export function attendStateOf({
  attending,
  waiting,
}: {
  attending: boolean;
  waiting: boolean;
}): AttendState {
  if (attending) return "attending";
  if (waiting) return "waiting";
  return "none";
}

/**
 * 참석 버튼 라벨.
 * 만석이어도 "인원 마감"으로 막지 않는다 — 그게 이 기능의 발단이다(더 오고 싶은
 * 사람에게 길이 없었다).
 */
export function attendButtonLabel(state: AttendState, isFull: boolean): string {
  if (state === "attending") return "✅ 참석";
  if (state === "waiting") return "대기 취소";
  return isFull ? "대기 신청" : "참석하기";
}

/**
 * 버튼 옆 보조 안내. 없으면 null(줄을 그리지 않는다).
 *
 * 대기 중인데 `rank`가 null인 경우가 있다 — 낙관적 업데이트로 "대기 중"까지만 즉시
 * 반영하고 순번은 서버 응답을 기다리는 찰나다. 숫자를 미리 지어내면 "3번이었는데
 * 5번이 됐다"로 보인다.
 */
export function waitHintText(
  state: AttendState,
  rank: number | null,
  total: number,
): string | null {
  if (state === "attending") return null;
  if (state === "waiting") return rank === null ? "대기 중" : `대기 ${rank}번`;
  return total > 0 ? `현재 ${total}명 대기 중` : null;
}
