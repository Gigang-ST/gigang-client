import { describe, expect, it } from "vitest";

import { matchPayer, type MemberRef, type AliasRef } from "@/lib/dues/match-payer";
import { amountHintOf } from "@/lib/dues/amount-hint";
import { bucketOf } from "@/lib/dues/upload-bucketize";

const members: MemberRef[] = [
  { memId: "m1", name: "김철수" },
  { memId: "m2", name: "김철순" },
  { memId: "m3", name: "이영희" },
  { memId: "m4", name: "이영희" }, // 동명이인
];

describe("matchPayer", () => {
  it("별칭 정규화: 한글 입력은 영문 별칭과 매칭 안 됨", () => {
    const aliases: AliasRef[] = [{ rawNameNorm: "mincholover", memId: "m1" }];
    const r = matchPayer("민초러버", members, aliases); // 정규화는 한글이라 별칭과는 다름
    // '민초러버'는 한글이라 별칭 'mincholover'와 안 맞음 → 아래 영문 케이스로 검증
    expect(r.status).not.toBe("matched");
  });
  it("영문 별칭 정확일치 → matched/alias", () => {
    const aliases: AliasRef[] = [{ rawNameNorm: "mincholover", memId: "m1" }];
    const r = matchPayer("MinChoLover", members, aliases);
    expect(r.status).toBe("matched");
    expect(r.memId).toBe("m1");
    expect(r.via).toBe("alias");
  });
  it("실명 정확일치(단일) → matched/exact", () => {
    const r = matchPayer("회비 김철수", members, []);
    expect(r.status).toBe("matched");
    expect(r.memId).toBe("m1");
    expect(r.via).toBe("exact");
  });
  it("꼬리말(기강회비·회비 선금) 제거 후 단일 일치 → matched/suffix", () => {
    for (const raw of ["김철수기강회비", "김철수 회비 선금", "김철수 기강"]) {
      const r = matchPayer(raw, members, []);
      expect(r.status).toBe("matched");
      expect(r.memId).toBe("m1");
      expect(r.via).toBe("suffix");
    }
  });
  it("꼬리말 제거 후 동명이인 → 자동 매칭 안 하고 ambiguous", () => {
    const r = matchPayer("이영희기강회비", members, []);
    expect(r.status).toBe("ambiguous");
    expect(r.memId).toBeNull();
    expect(r.candidates.map((c) => c.memId).sort()).toEqual(["m3", "m4"]);
  });
  it("동명이인 → ambiguous + 후보 2명", () => {
    const r = matchPayer("이영희", members, []);
    expect(r.status).toBe("ambiguous");
    expect(r.memId).toBeNull();
    expect(r.candidates.map((c) => c.memId).sort()).toEqual(["m3", "m4"]);
  });
  it("부분 포함 → unmatched + 후보 제시", () => {
    const r = matchPayer("김철수아내", members, []);
    expect(r.status).toBe("unmatched");
    expect(r.candidates[0].memId).toBe("m1");
  });
  it("후보 없음 → unmatched + 빈 후보", () => {
    const r = matchPayer("듣보잡", members, []);
    expect(r.status).toBe("unmatched");
    expect(r.candidates).toHaveLength(0);
  });
});

describe("matchPayer 꼬리말 보강(#703 리뷰)", () => {
  it("비회원 김기강은 회원 김기로 오매칭되지 않는다", () => {
    const r = matchPayer("김기강", [{ memId: "k", name: "김기" }], []);
    expect(r.status).not.toBe("matched");
  });
  it("꼬리말 뗀 이름의 별칭을 먼저 본다", () => {
    const r = matchPayer("민초기강회비", members, [{ rawNameNorm: "민초", memId: "m2" }]);
    expect(r.status).toBe("matched");
    expect(r.memId).toBe("m2");
    expect(r.via).toBe("alias");
  });
  it("이름이 꼬리말로 끝나는 회원은 실명 그대로 매칭", () => {
    const r = matchPayer("김기강", [{ memId: "g", name: "김기강" }, { memId: "k", name: "김기" }], []);
    expect(r.memId).toBe("g");
    expect(r.via).toBe("exact");
  });
  it("괄호·숫자·공백이 섞여도 꼬리말을 뗀다", () => {
    const ms: MemberRef[] = [{ memId: "h", name: "홍길동" }];
    for (const raw of ["홍길동(기강회비)", "홍길동 1월 회비선금"]) {
      const r = matchPayer(raw, ms, []);
      expect(r.memId).toBe("h");
      expect(r.status).toBe("matched");
    }
  });
});

describe("꼬리말 매칭 + 금액 힌트 통합", () => {
  it("이름+꼬리말+40,000원(프로젝트 참가비)은 autoDone이 아니라 needsReview", () => {
    const m = matchPayer("김철수기강회비", members, []);
    expect(m.status).toBe("matched");
    const amountHint = amountHintOf({
      io: "deposit", amt: 40000, memId: m.memId, monthlyFeeAmt: 4000,
      rules: [{ evtId: "e", evtNm: "프로젝트", amounts: [40000], registrantMemIds: [] }],
    });
    expect(bucketOf({ io: "deposit", itemCd: "due", matchStatus: m.status, amountHint })).toBe("needsReview");
    expect(bucketOf({ io: "deposit", itemCd: "due", matchStatus: m.status, amountHint: null })).toBe("autoDone");
  });
});
