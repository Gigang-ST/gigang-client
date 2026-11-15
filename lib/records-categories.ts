/**
 * 기강의 전당(랭킹탭) 종목 — 탭 순서의 정본. 팀 설정 `records.categories`(어느 종목을 세울지)와 랭킹 화면이 같은 목록을 본다.
 * 화면 이름은 「러닝」이지만 내부 값은 `marathon` 그대로다(DESIGN.md §기강의 전당).
 */
export const RECORD_CATEGORIES = [
  { value: "marathon", label: "러닝" },
  { value: "trail", label: "트레일러닝" },
  { value: "triathlon", label: "철인3종" },
  { value: "hyrox", label: "하이록스" },
] as const;

export type RecordCategoryKey = (typeof RECORD_CATEGORIES)[number]["value"];

export const RECORD_CATEGORY_KEYS = RECORD_CATEGORIES.map((c) => c.value) as [RecordCategoryKey, ...RecordCategoryKey[]];

/**
 * 팀이 고른 종목 → 화면에 세울 종목. **고른 순서 그대로**다(팀 설정에서 위에 둔 종목이 먼저 — 2026-11-10 유저 요청).
 * 모르는 값·겹친 값은 뺀다. 하나도 안 남으면(설정이 비거나 모르는 값뿐) 전부 정본 순서로 세운다 — 랭킹탭이 텅 비지 않게.
 */
export function visibleRecordCategories(picked: readonly string[]): RecordCategoryKey[] {
  const keys = picked.filter(
    (k, i): k is RecordCategoryKey => (RECORD_CATEGORY_KEYS as readonly string[]).includes(k) && picked.indexOf(k) === i,
  );
  return keys.length > 0 ? keys : [...RECORD_CATEGORY_KEYS];
}
