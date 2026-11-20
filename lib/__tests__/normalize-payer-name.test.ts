import { describe, expect, it } from "vitest";

import { normalizePayerName, stripPayerSuffix } from "@/lib/dues/normalize-payer-name";

describe("normalizePayerName", () => {
  it("공백 제거", () => {
    expect(normalizePayerName("홍 길 동")).toBe("홍길동");
  });
  it("앞에 붙은 '회비' 토큰 제거", () => {
    expect(normalizePayerName("회비 홍길동")).toBe("홍길동");
  });
  it("뒤에 붙은 '회비' 토큰 제거", () => {
    expect(normalizePayerName("홍길동회비")).toBe("홍길동");
  });
  it("숫자·특수문자 제거", () => {
    expect(normalizePayerName("홍길동2000")).toBe("홍길동");
    expect(normalizePayerName("홍길동(회비)")).toBe("홍길동");
  });
  it("영문은 소문자화", () => {
    expect(normalizePayerName("MinChoLover")).toBe("mincholover");
  });
  it("빈 입력은 빈 문자열", () => {
    expect(normalizePayerName("   ")).toBe("");
  });
});

describe("stripPayerSuffix", () => {
  it("끝 꼬리말 제거", () => {
    expect(stripPayerSuffix("홍길동기강회비")).toBe("홍길동");
    expect(stripPayerSuffix("홍길동회비선금")).toBe("홍길동");
  });
  it("꼬리말이 없거나 전부 꼬리말이면 그대로", () => {
    expect(stripPayerSuffix("홍길동")).toBe("홍길동");
    expect(stripPayerSuffix("기강")).toBe("기강");
  });
});

describe("stripPayerSuffix 단독 꼬리말 보호", () => {
  it("떼고 남는 이름이 1글자면 단독 꼬리말은 안 뗀다", () => {
    expect(stripPayerSuffix("김기강")).toBe("김기강");
    expect(stripPayerSuffix("이회비")).toBe("이회비");
  });
  it("복합 꼬리말은 그대로 뗀다", () => {
    expect(stripPayerSuffix("김철수기강회비")).toBe("김철수");
  });
});
