declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function send(event: string, params?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", event, params);
}

/**
 * 가입 폼(`MemberOnboardingForm`) 단계 — **실제 화면 순서** 그대로다.
 * `onboarding_step`의 `step`은 이 배열의 1-based 위치라, 순서를 바꾸면 GA 퍼널이 뒤섞인다.
 * (진행바 `SignupProgress`의 1~6과는 다른 축 — 그쪽은 newbie·login까지 센다.)
 */
export const ONBOARDING_STAGES = [
  "phone",
  "details",
  "profile",
  "purpose",
  "pledge",
  "success",
] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

export function onboardingStepNo(stage: OnboardingStage): number {
  return ONBOARDING_STAGES.indexOf(stage) + 1;
}

/**
 * 같은 키는 처음 한 번만 `true`를 돌려주는 관문. 재렌더·뒤로가기·StrictMode 이중 effect로
 * 같은 이벤트가 두 번 나가지 않게 컴포넌트 ref에 하나 들고 쓴다.
 */
export function createOnceGate<K>() {
  const seen = new Set<K>();
  return {
    pass(key: K): boolean {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
    reset() {
      seen.clear();
    },
  };
}

export const analytics = {
  // "story"는 가운데 로고 탭(홈 `/` = 전광판), "schedule"은 달력(구 홈).
  // 과거 데이터의 "home"은 달력 탭을 뜻한다 — 지표 비교 시 주의.
  tabClick: (tab: "schedule" | "story" | "projects" | "records" | "profile") =>
    send("tab_click", { tab }),

  boardTabSwitch: (tab: "notice" | "update") =>
    send("board_tab_switch", { tab }),

  raceDetailViewed: (raceId: string, raceName: string) =>
    send("race_detail_viewed", { race_id: raceId, race_name: raceName }),

  raceRegistrationOpened: (raceId: string, raceName: string) =>
    send("race_registration_opened", { race_id: raceId, race_name: raceName }),

  raceRegistrationCompleted: (raceId: string) =>
    send("race_registration_completed", { race_id: raceId }),

  projectJoinStarted: (evtId: string) =>
    send("project_join_started", { evt_id: evtId }),

  projectJoinCompleted: (evtId: string) =>
    send("project_join_completed", { evt_id: evtId }),

  activityLogOpened: () =>
    send("activity_log_opened"),

  activityLogSaved: (count: number) =>
    send("activity_log_saved", { count }),

  monthNavigated: (direction: "prev" | "next", toMonth: string) =>
    send("month_navigated", { direction, to_month: toMonth }),

  // 건의 **제출 성공** 시점. 예전 이름 `feedback_clicked`는 한 번도 발송된 적 없어(GA 0건) 바꿨다.
  feedbackSubmitted: () =>
    send("feedback_submitted"),

  onboardingStep: (stage: OnboardingStage) =>
    send("onboarding_step", { step: onboardingStepNo(stage), stage }),
};
