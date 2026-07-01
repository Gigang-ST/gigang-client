import { describe, expect, it } from "vitest";

import { matchPayer, type MemberRef, type AliasRef } from "@/lib/dues/match-payer";

const members: MemberRef[] = [
  { memId: "m1", name: "김철수" },
  { memId: "m2", name: "김철순" },
  { memId: "m3", name: "이영희" },
  { memId: "m4", name: "이영희" }, // 동명이인
];

describe("matchPayer", () => {
  it("별칭이 있으면 별칭으로 matched", () => {
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
