import type { MatchStatus } from "@/lib/dues/match-payer";

export type Bucket = "autoDone" | "needsReview" | "excluded";

/**
 * 업로드 거래 1건을 3버킷 중 하나로 분류한다(순수 함수).
 * - excluded: 출금이거나 triage 대상이 아닌 분류(other/expense/goods/커스텀 등 전부)
 * - autoDone: 입금 + 회비(due) + 매칭 성공
 * - needsReview: 입금 + 회비(미매칭·동명이인) 또는 프로젝트(event_fee — 귀속 판단 필요)
 *
 * triage(확인필요)의 판단 어휘는 회비/프로젝트/제외 3종뿐이므로, 그 밖의 분류(goods 등
 * 수동 등록·커스텀 코드)는 excluded 로 보내 저장값 그대로 확정되게 한다 — needsReview 에
 * 떨어뜨리면 기본 결정이 그 분류를 표현하지 못해 확정 시 조용히 덮어써진다.
 */
export function bucketOf(input: {
  io: "deposit" | "withdrawal";
  itemCd: string; // 'due' | 'expense' | 'other' | ...
  matchStatus: MatchStatus;
}): Bucket {
  if (input.io === "withdrawal") return "excluded";
  if (input.itemCd !== "due" && input.itemCd !== "event_fee") return "excluded";
  if (input.itemCd === "due" && input.matchStatus === "matched") return "autoDone";
  return "needsReview";
}
