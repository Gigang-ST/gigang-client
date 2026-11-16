/**
 * 관리자 회원 목록 — 헤더를 눌러 정렬(#676, 오너 요청).
 *
 * 기본은 **가입일 최신순**(예전 목록 순서 그대로). 열을 처음 누르면 오름차순, 다시 누르면 내림차순으로 오간다.
 * 값이 비어 있는 행(생년월일·연락처·잔액 없음 등)은 **방향과 상관없이 늘 맨 뒤**로 보낸다 — 내림차순에서
 * 빈 칸이 맨 위로 올라오면 정작 보고 싶은 값이 화면 밖으로 밀린다.
 * 같은 값끼리는 이름순으로 묶어 누를 때마다 순서가 흔들리지 않게 한다.
 */

export type MemberSortKey = "name" | "gender" | "birthday" | "joined" | "phone" | "status" | "balance";
export type SortDir = "asc" | "desc";
export type MemberSort = { key: MemberSortKey; dir: SortDir };

export const DEFAULT_MEMBER_SORT: MemberSort = { key: "joined", dir: "desc" };

export type SortableMember = {
  full_name: string | null;
  gender: string | null;
  birthday: string | null;
  joined_at: string | null;
  phone: string | null;
  status: string | null;
  bal_amt: number | null;
};

/** 상태는 글자순이 아니라 운영 순서(활성 → 비활성 → 탈퇴) */
const STATUS_ORDER: Record<string, number> = { active: 0, inactive: 1, left: 2 };
/** 성별도 표시 순서(남 → 여) */
const GENDER_ORDER: Record<string, number> = { male: 0, female: 1 };

function sortValue(m: SortableMember, key: MemberSortKey): string | number | null {
  switch (key) {
    case "name":
      return m.full_name || null;
    case "gender":
      return m.gender ? (GENDER_ORDER[m.gender] ?? 9) : null;
    case "birthday":
      // date 컬럼(YYYY-MM-DD) — 문자열 비교가 곧 날짜 비교
      return m.birthday || null;
    case "joined":
      return m.joined_at || null;
    case "phone":
      return m.phone || null;
    case "status":
      return m.status ? (STATUS_ORDER[m.status] ?? 9) : null;
    case "balance":
      return m.bal_amt;
  }
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ko");
}

export function sortMembers<T extends SortableMember>(list: readonly T[], sort: MemberSort): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (va !== null && vb !== null) {
      const diff = compareValues(va, vb);
      if (diff !== 0) return diff * sign;
    }
    return (a.full_name ?? "").localeCompare(b.full_name ?? "", "ko");
  });
}

/** 헤더를 눌렀을 때 다음 정렬 — 다른 열이면 오름차순부터, 같은 열이면 방향만 뒤집는다 */
export function nextMemberSort(current: MemberSort, key: MemberSortKey): MemberSort {
  if (current.key !== key) return { key, dir: "asc" };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}
