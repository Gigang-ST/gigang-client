/**
 * 입금 금액으로 명목(회비 / 프로젝트)을 먼저 가르는 순수 판정 (#708).
 *
 * 배경: 입금자 이름만 회원과 맞으면 곧바로 "회비 자동 확정"이 되어, 동계훈련(PB 클래스)
 * 참가비 입금이 회비로 잘못 확정됐다. 이름보다 금액이 명목을 더 잘 말해 준다 —
 * - 진행 중 프로젝트의 참가비와 같은 금액 → 프로젝트 후보로 먼저 제안(등록자와 대조)
 * - 월회비 단위가 아닌 금액 → 회비로 자동 확정하지 않는다(사람이 확인)
 * 두 경우 모두 "자동(autoDone)"에서 "확인(needsReview)"으로 내려 사람이 보게 한다.
 */

export type ProjectFeeRule = {
  evtId: string;
  evtNm: string;
  /** 이 프로젝트에서 나올 수 있는 입금액 — 기본 설정 합계·할인 적용 합계·참가자별 실제 합계 */
  amounts: number[];
  /** 프로젝트에 참가 등록(신청)한 회원 id */
  registrantMemIds: string[];
};

export type AmountHint =
  | {
      kind: "project";
      evtId: string;
      evtNm: string;
      /** 입금자(매칭 회원)가 이 프로젝트 등록자인가. 입금자를 아직 모르면 null */
      registered: boolean | null;
    }
  | { kind: "nonUnit"; monthlyFeeAmt: number };

/** 참가비 설정 → 가능한 입금액 집합 (보증금 + 참가비, 마일리지런 할인 적용분, 참가비만(늦은 합류)) */
export function projectAmountsOf(input: {
  depositAmt: number;
  entryFeeAmt: number;
  mlgDcAmt: number;
  participants: { depositAmt: number; entryFeeAmt: number }[];
}): number[] {
  const set = new Set<number>();
  const base = input.depositAmt + input.entryFeeAmt;
  set.add(base);
  if (input.mlgDcAmt > 0) set.add(Math.max(0, base - input.mlgDcAmt));
  for (const p of input.participants) set.add(p.depositAmt + p.entryFeeAmt);
  // 0원 입금은 없다. 참가비만 내는 늦은 합류는 participants 행의 합계로 들어온다.
  set.delete(0);
  return [...set];
}

/**
 * 입금 1건의 금액 힌트. 출금이거나 힌트가 없으면 null.
 * 프로젝트 금액 일치가 월회비 배수 판정보다 앞선다 — 40,000원처럼 월회비의 배수이면서
 * 프로젝트 참가비인 금액이 정확히 이번 사고였다.
 */
export function amountHintOf(input: {
  io: "deposit" | "withdrawal";
  amt: number;
  /** 매칭된 회원(아직 모르면 null) */
  memId: string | null;
  rules: ProjectFeeRule[];
  /** 월회비 단가. 모르면(0 이하) 월회비 단위 판정은 하지 않는다 */
  monthlyFeeAmt: number;
}): AmountHint | null {
  if (input.io !== "deposit") return null;

  const hits = input.rules.filter((r) => r.amounts.includes(input.amt));
  if (hits.length > 0) {
    // 입금자가 등록자인 프로젝트를 우선한다
    const registeredHit = input.memId ? hits.find((r) => r.registrantMemIds.includes(input.memId!)) : undefined;
    const rule = registeredHit ?? hits[0];
    return {
      kind: "project",
      evtId: rule.evtId,
      evtNm: rule.evtNm,
      registered: input.memId ? Boolean(registeredHit) : null,
    };
  }

  if (input.monthlyFeeAmt > 0 && input.amt % input.monthlyFeeAmt !== 0) {
    return { kind: "nonUnit", monthlyFeeAmt: input.monthlyFeeAmt };
  }
  return null;
}

/** 화면 한 줄 설명 (운영진용). 금액·이름 같은 실데이터는 호출부가 넣지 않는다 — 프로젝트 이름만 쓴다. */
export function amountHintLabel(hint: AmountHint): string {
  if (hint.kind === "nonUnit") return "월회비 단위가 아닌 금액이에요";
  if (hint.registered === true) return `${hint.evtNm} 참가비와 같은 금액 · 등록자예요`;
  if (hint.registered === false) return `${hint.evtNm} 참가비와 같은 금액 · 등록자가 아니에요`;
  return `${hint.evtNm} 참가비와 같은 금액이에요`;
}

/**
 * 저장된 거래 1건의 힌트 — 처리 화면·업로드·운영 MCP 가 **같은 기준**을 쓰는 단일 진입점이다.
 * 회비·프로젝트 분류만 본다. 이미 프로젝트로 분류된 건엔 "월회비 단위 아님"이 의미 없어 프로젝트 힌트만 남긴다.
 */
export function amountHintForRow(input: {
  io: "deposit" | "withdrawal";
  itemCd: string;
  amt: number;
  memId: string | null;
  ctx: { rules: ProjectFeeRule[]; monthlyFeeAmt: number };
}): AmountHint | null {
  if (input.itemCd !== "due" && input.itemCd !== "event_fee") return null;
  const hint = amountHintOf({
    io: input.io,
    amt: input.amt,
    memId: input.memId,
    rules: input.ctx.rules,
    monthlyFeeAmt: input.ctx.monthlyFeeAmt,
  });
  return input.itemCd === "event_fee" && hint?.kind === "nonUnit" ? null : hint;
}
