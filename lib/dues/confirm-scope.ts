import type { Bucket } from "@/lib/dues/upload-bucketize";

/**
 * 거래내역 처리 인박스의 "재분류/확정 스코프" 판정 (순수 함수).
 *
 * 배경: 자동(autoDone)·제외(excluded) 행은 원래 저장값 그대로 확정되는 읽기전용이다.
 * 하지만 "자동 매칭된 회원이 낸 프로젝트 입금"처럼 자동 버킷에 '회비'로 잠긴 건을
 * 운영자가 프로젝트/제외로 옮겨야 할 때가 있다. 그래서 하단 일괄 분류 버튼으로 자동·제외
 * 행을 '재분류'하면, 그 행은 확인필요와 동일한 결정(편집) 흐름에 편입된다.
 */

/**
 * 확인필요가 아닌 행(자동·제외)이 일괄 분류로 '재분류'됐는지 판정.
 * 재분류 신호 = 그 행에 분류(itemCd) override 가 존재. 확인필요 행은 원래 편집 대상이라 제외.
 */
export function isReclassified(bucket: Bucket, hasItemCdOverride: boolean): boolean {
  return bucket !== "needsReview" && hasItemCdOverride;
}

/**
 * 확정 시 '결정(review) 경로'로 보낼 행인가 = 확인필요(원래 편집) 또는 재분류된 자동·제외 행.
 * 결정 경로는 새 분류·회원·프로젝트를 함께 전송하고, 그 외 자동·제외는 저장값(txnId만)으로 확정된다.
 * 재분류된 자동·제외 행이 저장값 경로로 새면 낡은 '회비' 분류가 그대로 확정되므로 반드시 분리한다.
 */
export function isDecisionRow(bucket: Bucket, hasItemCdOverride: boolean): boolean {
  return bucket === "needsReview" || isReclassified(bucket, hasItemCdOverride);
}

/**
 * 일괄 분류(재분류) 가능한 행인가 — 입금만 허용.
 * 출금을 회비/프로젝트 같은 수입 분류로 바꾸는 사고를 막는다(자동은 항상 입금, 제외엔 출금이 섞임).
 */
export function canReclassify(io: "deposit" | "withdrawal"): boolean {
  return io === "deposit";
}
