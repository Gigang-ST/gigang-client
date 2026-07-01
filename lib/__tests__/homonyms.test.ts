import { describe, expect, it } from "vitest";

import { duplicateNames, memberLabel } from "@/lib/dues/homonyms";

describe("duplicateNames", () => {
  it("중복이 없으면 빈 집합", () => {
    expect(duplicateNames([{ name: "홍길동" }, { name: "김철수" }]).size).toBe(0);
  });
  it("2명 공유 이름을 담는다", () => {
    const d = duplicateNames([{ name: "홍길동" }, { name: "홍길동" }, { name: "김철수" }]);
    expect(d.has("홍길동")).toBe(true);
    expect(d.has("김철수")).toBe(false);
  });
  it("3명 이상·복수 그룹", () => {
    const d = duplicateNames([
      { name: "A" }, { name: "A" }, { name: "A" }, { name: "B" }, { name: "B" }, { name: "C" },
    ]);
    expect([...d].sort()).toEqual(["A", "B"]);
  });
  it("이름을 정규화하지 않는다(정확 일치)", () => {
    expect(duplicateNames([{ name: "홍길동" }, { name: "홍길동 " }]).size).toBe(0);
  });
});

describe("memberLabel", () => {
  const dup = new Set(["홍길동"]);
  it("동명이인이 아니면 birthDt가 있어도 이름만", () => {
    expect(memberLabel({ name: "김철수", birthDt: "1990-03-15" }, dup)).toBe("김철수");
  });
  it("동명이인 + 유효 birthDt → 이름 (YY.MM.DD)", () => {
    expect(memberLabel({ name: "홍길동", birthDt: "1990-03-15" }, dup)).toBe("홍길동 (90.03.15)");
  });
  it("동명이인 + null birthDt → 이름만", () => {
    expect(memberLabel({ name: "홍길동", birthDt: null }, dup)).toBe("홍길동");
  });
  it("동명이인 + 파싱 불가 birthDt → 이름만", () => {
    expect(memberLabel({ name: "홍길동", birthDt: "not-a-date" }, dup)).toBe("홍길동");
  });
});
