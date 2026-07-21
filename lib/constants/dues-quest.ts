/**
 * 출석 기반 회비 감면(퀘스트) 규칙 상수.
 *
 * 규칙은 DB 컬럼·관리 UI로 빼지 않고 코드 한 곳에 둔다(설계 §3).
 * 임계값·감면비율은 파라미터지만 거의 안 바뀌므로 DB+관리UI는 과하다.
 * 회비 단가는 여기 두지 않고 `fee_policy_cfg.monthly_fee_amt`에서 받는다
 * (감면액 = 단가 × 비율 → 회비 변동 자동 대응).
 *
 * 나중에 DB화가 필요하면 이 상수를 읽던 자리를 `fee_policy_cfg`에서 읽도록 바꾸면 된다.
 * `calcExemption`은 숫자를 인자로 받는 순수 함수라 호출부는 안 바뀐다(설계 §11).
 */
export const DUES_QUEST = {
  /** 게이트 임계값: 정모 참석 OR 모임 개설 중 하나만 충족해도 통과 */
  gate: { regularAttend: 1, hosted: 1 },
  /** 참석 횟수 티어: 높은 티어가 우선(내림차순 평가). 단계형(누적 아님) */
  tiers: [
    { attendCnt: 4, exmRatio: 0.5 }, // 4회 → 회비의 50%
    { attendCnt: 8, exmRatio: 1.0 }, // 8회 → 전액
  ],
} as const;
