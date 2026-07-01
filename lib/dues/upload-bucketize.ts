import type { MatchStatus } from "@/lib/dues/match-payer";

export type Bucket = "autoDone" | "needsReview" | "excluded";

/**
 * 업로드 거래 1건을 3버킷 중 하나로 분류한다(순수 함수).
 * - excluded: 출금이거나 `other`/`expense` 분류(예금이자·타행자동이체·지출)
 * - autoDone: 입금 + 회비(due) + 매칭 성공
 * - needsReview: 입금이면서 위 둘에 해당하지 않는 것(미매칭·동명이인 회비)
 */
export function bucketOf(input: {
  io: "deposit" | "withdrawal";
  itemCd: string; // 'due' | 'expense' | 'other' | ...
  matchStatus: MatchStatus;
}): Bucket {
  if (input.io === "withdrawal") return "excluded";
  if (input.itemCd === "other" || input.itemCd === "expense") return "excluded";
  if (input.itemCd === "due" && input.matchStatus === "matched") return "autoDone";
  return "needsReview";
}
