declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function send(event: string, params?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", event, params);
}

export const analytics = {
  tabClick: (tab: "home" | "races" | "projects" | "records" | "profile") =>
    send("tab_click", { tab }),

  boardTabSwitch: (tab: "notice" | "update") =>
    send("board_tab_switch", { tab }),

  raceTabSwitch: (tab: "team" | "all") =>
    send("race_tab_switch", { tab }),

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

  feedbackClicked: () =>
    send("feedback_clicked"),

  onboardingStep: (step: number) =>
    send("onboarding_step", { step }),
};
