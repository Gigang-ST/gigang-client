/** 원천 컬럼(is_cfm_yn + 스냅샷 반영여부)을 운영자용 3종 표시 상태로 파생한다. */
export type TxnStatusInput = { isConfirmed: boolean; isReflected: boolean };
export type TxnDisplayStatus = "처리대기" | "확정" | "반영완료";

export function deriveTxnStatus(input: TxnStatusInput): TxnDisplayStatus {
  if (input.isReflected) return "반영완료";
  if (input.isConfirmed) return "확정";
  return "처리대기";
}
