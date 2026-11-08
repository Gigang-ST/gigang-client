/**
 * feedback_submitted 는 **제출 성공 시에만** 나간다 (이슈 #297 결정 2).
 * 페이지 진입·서버 거절·예외에선 보내지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitFeedback, feedbackSubmitted } = vi.hoisted(() => ({
  submitFeedback: vi.fn(),
  feedbackSubmitted: vi.fn(),
}));

vi.mock("@/app/actions/feedback/submit-feedback", () => ({ submitFeedback }));
vi.mock("@/lib/analytics", () => ({ analytics: { feedbackSubmitted } }));

import { submitFeedbackWithTracking } from "@/components/feedback/feedback-form";

beforeEach(() => {
  submitFeedback.mockReset();
  feedbackSubmitted.mockReset();
});

describe("submitFeedbackWithTracking", () => {
  it("접수 성공이면 한 번 보낸다", async () => {
    submitFeedback.mockResolvedValue({ ok: true });
    const result = await submitFeedbackWithTracking("불편한 점");
    expect(result.ok).toBe(true);
    expect(feedbackSubmitted).toHaveBeenCalledTimes(1);
  });

  it("서버가 거절하면 보내지 않는다", async () => {
    submitFeedback.mockResolvedValue({ ok: false, message: "입력값이 올바르지 않습니다." });
    await submitFeedbackWithTracking("");
    expect(feedbackSubmitted).not.toHaveBeenCalled();
  });

  it("예외가 나면 보내지 않는다", async () => {
    submitFeedback.mockRejectedValue(new Error("network"));
    await expect(submitFeedbackWithTracking("x")).rejects.toThrow();
    expect(feedbackSubmitted).not.toHaveBeenCalled();
  });

  it("모듈을 불러오기만 해선(=페이지 진입) 보내지 않는다", () => {
    expect(feedbackSubmitted).not.toHaveBeenCalled();
  });
});
