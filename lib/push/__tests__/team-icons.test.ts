import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createUntypedAdminClient: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: {} }));

import { TEAM_ID_BY_CD, teamCdOf } from "@/lib/constants/gigang-team";
import { withTeamIcons } from "@/lib/push/send-push";

describe("withTeamIcons — 푸시 알림 아이콘은 보내는 팀 것", () => {
  const payload = { title: "새 모임", url: "/schedule" };

  it("기강은 원래 아이콘 그대로", () => {
    expect(withTeamIcons(TEAM_ID_BY_CD.gigang, payload)).toEqual({
      ...payload,
      icon: "/GIGANG.png",
      badge: "/notification-badge.png",
    });
  });

  it("울산은 자기 폴더 아이콘", () => {
    expect(withTeamIcons(TEAM_ID_BY_CD.ulsan, payload)).toEqual({
      ...payload,
      icon: "/teams/ulsan/notification-icon.png",
      badge: "/teams/ulsan/notification-badge.png",
    });
  });

  it("모르는 팀은 아이콘을 안 싣는다 — 기강 아이콘으로 물러나지 않는다", () => {
    expect(withTeamIcons("00000000-0000-0000-0000-000000000000", payload)).toEqual(payload);
  });
});

describe("teamCdOf", () => {
  it("팀 ID → 팀 코드, 모르면 null", () => {
    expect(teamCdOf(TEAM_ID_BY_CD.ulsan)).toBe("ulsan");
    expect(teamCdOf("nope")).toBeNull();
  });
});
