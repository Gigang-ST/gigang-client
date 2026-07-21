import { describe, expect, it } from "vitest";

import {
  GATHERING_CANCEL_REASON_MAX_LENGTH,
  validateCancelReason,
} from "@/lib/gathering/cancel-reason";

describe("validateCancelReason", () => {
  it("null/undefined 는 사유 없음(null)", () => {
    expect(validateCancelReason()).toEqual({ ok: true, value: null });
    expect(validateCancelReason(null)).toEqual({ ok: true, value: null });
  });

  it("공백만 있으면 trim 후 null", () => {
    expect(validateCancelReason("   ")).toEqual({ ok: true, value: null });
  });

  it("일반 사유는 trim 된 값 반환", () => {
    expect(validateCancelReason("  부상  ")).toEqual({ ok: true, value: "부상" });
  });

  it("정확히 500자는 허용", () => {
    const exact = "가".repeat(GATHERING_CANCEL_REASON_MAX_LENGTH);
    expect(validateCancelReason(exact)).toEqual({ ok: true, value: exact });
  });

  it("501자는 거부(잘라내지 않음)", () => {
    const tooLong = "가".repeat(GATHERING_CANCEL_REASON_MAX_LENGTH + 1);
    const result = validateCancelReason(tooLong);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, message: "취소 사유는 500자 이내로 입력해주세요." });
  });

  it("앞뒤 공백 제외 500자면 허용(공백 포함 502자)", () => {
    const padded = ` ${"나".repeat(GATHERING_CANCEL_REASON_MAX_LENGTH)} `;
    expect(validateCancelReason(padded)).toEqual({
      ok: true,
      value: "나".repeat(GATHERING_CANCEL_REASON_MAX_LENGTH),
    });
  });
});
