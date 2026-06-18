import { describe, expect, it } from "vitest";

import { digitsOnly, formatPhone, isValidPhone } from "@/lib/phone-utils";

describe("digitsOnly", () => {
  it("숫자 외 문자 제거", () => {
    expect(digitsOnly("010-1234-5678")).toBe("01012345678");
  });

  it("이미 숫자만 있으면 그대로", () => {
    expect(digitsOnly("01012345678")).toBe("01012345678");
  });

  it("빈 문자열", () => {
    expect(digitsOnly("")).toBe("");
  });
});

describe("formatPhone", () => {
  it("3자리 이하는 그대로", () => {
    expect(formatPhone("010")).toBe("010");
    expect(formatPhone("01")).toBe("01");
  });

  it("4~7자리는 010-XXXX", () => {
    expect(formatPhone("01012")).toBe("010-12");
    expect(formatPhone("0101234")).toBe("010-1234");
  });

  it("8~11자리는 010-XXXX-XXXX", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
  });

  it("하이픈 포함 입력도 정상 처리", () => {
    expect(formatPhone("010-1234-5678")).toBe("010-1234-5678");
  });
});

describe("isValidPhone", () => {
  it("유효한 010 번호", () => {
    expect(isValidPhone("01012345678")).toBe(true);
    expect(isValidPhone("010-1234-5678")).toBe(true);
  });

  it("011, 016 등 구형 번호는 무효", () => {
    expect(isValidPhone("01112345678")).toBe(false);
  });

  it("자릿수 부족", () => {
    expect(isValidPhone("0101234567")).toBe(false);
  });

  it("자릿수 초과", () => {
    expect(isValidPhone("010123456789")).toBe(false);
  });

  it("빈 문자열은 무효", () => {
    expect(isValidPhone("")).toBe(false);
  });
});
