/**
 * GA 이벤트 발송 규칙 (이슈 #297).
 *
 * - onboarding_step: 가입 폼 6단계를 **실제 화면 순서** 1~6으로, 단계마다 처음 한 번만.
 * - 관문(createOnceGate): 같은 키 재통과 금지 · reset 뒤엔 다시 센다(대회 상세 열림당 1회).
 * - 개인정보를 싣지 않는다 — 단계 이벤트 params는 step·stage 둘뿐.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  analytics,
  createOnceGate,
  ONBOARDING_STAGES,
  onboardingStepNo,
  type OnboardingStage,
} from "@/lib/analytics";

const gtag = vi.fn();

beforeEach(() => {
  gtag.mockReset();
  vi.stubGlobal("window", { gtag });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("onboardingStepNo — 실제 가입 흐름 순서", () => {
  it("phone→details→profile→purpose→pledge→success 가 1~6", () => {
    expect(ONBOARDING_STAGES.map(onboardingStepNo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(onboardingStepNo("phone")).toBe(1);
    expect(onboardingStepNo("details")).toBe(2);
    expect(onboardingStepNo("profile")).toBe(3);
    expect(onboardingStepNo("purpose")).toBe(4);
    expect(onboardingStepNo("pledge")).toBe(5);
    expect(onboardingStepNo("success")).toBe(6);
  });
});

describe("analytics.onboardingStep", () => {
  it("step 번호와 stage 이름만 싣는다", () => {
    analytics.onboardingStep("profile");
    expect(gtag).toHaveBeenCalledExactlyOnceWith("event", "onboarding_step", {
      step: 3,
      stage: "profile",
    });
  });

  it("gtag가 없으면 조용히 넘어간다", () => {
    vi.stubGlobal("window", {});
    expect(() => analytics.onboardingStep("phone")).not.toThrow();
  });
});

describe("단계 이벤트 중복 방지 — 가입 폼 effect와 같은 조합", () => {
  /** 폼의 useEffect 본문과 같은 일을 한다: stage가 바뀔 때마다 관문을 통과한 것만 보낸다 */
  function simulate(stages: OnboardingStage[]) {
    const gate = createOnceGate<OnboardingStage>();
    for (const stage of stages) {
      if (gate.pass(stage)) analytics.onboardingStep(stage);
    }
  }

  it("같은 단계 재렌더(effect 재실행)는 한 번만 보낸다", () => {
    simulate(["phone", "phone", "phone"]);
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it("이전으로 되돌아갔다 다시 와도 단계당 한 번", () => {
    simulate(["phone", "details", "profile", "details", "profile", "purpose", "profile", "purpose", "pledge", "success"]);
    const steps = gtag.mock.calls.map((c) => (c[2] as { step: number }).step);
    expect(steps).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("createOnceGate", () => {
  it("reset 뒤엔 같은 키를 다시 통과시킨다(대회 상세: 닫았다 다시 열면 새 열림)", () => {
    const gate = createOnceGate<string>();
    expect(gate.pass("comp-1")).toBe(true);
    expect(gate.pass("comp-1")).toBe(false);
    expect(gate.pass("comp-2")).toBe(true);
    gate.reset();
    expect(gate.pass("comp-1")).toBe(true);
  });
});
