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
 *
 * `openToAll`(시작 2시간 전부터, `isWaitlistOpenToAll`)이면 **"대기"라는 말을 쓰지 않는다.**
 * 그 구간엔 순번도 자동 확정도 없고 받는 것은 알림 하나뿐인데, "대기"라고 부르면 버튼이
 * 지키지 못할 약속을 한다 — 사용자는 그 말에서 순번과 자동 확정을 기대한다(설계 §4-2).
 */
export function attendButtonLabel(
  state: AttendState,
  /** 실제 정원이 찼는가 — **내 상태와 무관하게** 계산해 넘긴다(대기자도 이 값이 필요하다). */
  isFull: boolean,
  openToAll: boolean,
): string {
  if (state === "attending") return "✅ 참석";
  // 선착순 구간에 자리가 났으면 신청해 둔 사람도 **직접 눌러야** 한다 — 자동 승급이 없다.
  if (!isFull && (state === "none" || openToAll)) return "참석하기";
  if (state === "waiting") return openToAll ? "알림 요청 취소" : "대기 취소";
  return openToAll ? "빈 자리 알림 요청" : "대기 신청";
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
  openToAll: boolean,
): string | null {
  if (state === "attending") return null;
  if (openToAll) {
    // 순번이 없는 구간이라 숫자를 말하지 않는다. 미신청자에게는 할 말이 없다 —
    // 버튼에 이미 "빈 자리 알림 요청"이라고 적혀 있다.
    return state === "waiting" ? "빈 자리가 나면 알려드려요" : null;
  }
  if (state === "waiting") {
    // **"자리 나면 자동 확정"을 여기 붙이는 것이 핵심이다.** 확인 다이얼로그는 한 번 보고
    // 지나가지만 이 줄은 줄 서 있는 내내 남아, "안 갈 거면 내가 빼야 한다"를 계속 말한다.
    return rank === null ? "대기 중" : `대기 ${rank}번 · 자리 나면 자동 확정`;
  }
  return total > 0 ? `현재 ${total}명 대기 중` : null;
}

/** 대기 신청 확인 다이얼로그 문구. `lines[1]`이 경고라 화면이 그 줄만 강조한다. */
export type WaitConfirmCopy = { title: string; lines: string[]; confirmLabel: string };

/**
 * 대기 신청 전 확인 문구.
 *
 * **누르기 전에** 알려야 한다 — 자동으로 참석자가 되는 건 되돌리기 번거로운 일이고
 * (임박 취소는 사유가 필수다) 사후 토스트로는 늦다.
 *
 * 취소 페널티(사유 필수·취소 이력)는 여기 적지 않는다: 신청하는 자리에서 불이익까지
 * 설명하면 겁주는 문서가 된다. 필요한 건 "안 갈 거면 네가 빼라" 하나다.
 *
 * "2시간 뒤 대기가 취소된다"고도 쓰지 않는다 — 사실이 아니고(행을 지우지 않는다) 무엇보다
 * **박탈로 읽힌다.** 실제로는 여전히 참석할 수 있고 순번만 무의미해지는, 오히려 기회가
 * 열리는 쪽이다.
 *
 * 사실 → 경고 순으로 적는다. 경고를 맨 앞에 두면 자동 참석된다는 것을 모르는 상태에서
 * 읽게 되어 왜 취소해야 하는지가 안 잡힌다.
 */
export function waitConfirmCopy(openToAll: boolean): WaitConfirmCopy {
  if (openToAll) {
    return {
      title: "빈 자리 알림을 요청할까요?",
      lines: ["지금은 순번 없이 선착순입니다.", "빈 자리가 나면 알림을 보내드립니다."],
      confirmLabel: "알림 요청",
    };
  }
  return {
    title: "대기 신청할까요?",
    lines: [
      "참석자가 취소하면 순번대로 자동 참석됩니다.",
      "참석이 어려우면 미리 대기를 취소해주세요.",
      "시작 2시간 전부터는 대기 순번이 없고 선착순으로 바뀝니다.",
      "이후 빈 자리가 나면 알림을 보내드리니 직접 참석해주세요.",
    ],
    confirmLabel: "대기 신청",
  };
}

/**
 * 조회해 둔 대기 명단에 **내 대기 행 변경만** 얹는다 — 토글 뒤 재조회 없이 화면 명단을 맞추려고.
 * 참석자 명단이 참석·취소 때 `setAttendees`로 낙관적으로 바뀌는 것과 같은 방식이다.
 *
 * `mine`: `undefined` = 바꿀 것 없음(그대로) / `null` = 나를 뺀다 / 값 = 나를 넣는다(이미 있으면 교체).
 * 새로 넣는 행의 `wait_at`은 호출부가 지금 시각으로 넘긴다 — 방금 줄 섰으니 맨 뒤 순번이다.
 * 원본 배열은 건드리지 않고, 바꿀 게 없으면 같은 참조를 돌려준다(불필요한 렌더 방지).
 */
export function applyMyWaitOverride<T extends WaitEntry>(
  entries: T[],
  memId: string | null | undefined,
  mine: T | null | undefined,
): T[] {
  if (!memId || mine === undefined) return entries;
  const others = entries.filter((e) => e.mem_id !== memId);
  return mine ? [...others, mine] : others;
}
