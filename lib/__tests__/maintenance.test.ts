import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import {
  formatMaintenanceUntil,
  isMaintenanceActive,
  preCheckMaintenance,
  type MaintenanceConfig,
} from "@/lib/maintenance";

/**
 * 점검 모드 판정을 못박는다.
 *
 * 이 판정은 **장애가 났을 때만** 실행되는 코드라, 평소엔 아무도 밟지 않는다 —
 * 정작 필요한 순간에 처음 돌아본다는 뜻이다. 그래서 경계를 테스트로 굳혀 둔다.
 *
 * 가장 중요한 건 **fail-open**이다: Edge Config를 못 읽었다고 멀쩡한 서비스를 내리면
 * 점검 모드가 장애의 원인이 된다. 점검은 **명시적으로 켰을 때만** 켜진다.
 */

const SECRET = "s3cret";
const base = {
  pathname: "/schedule",
  bypassParam: null as string | null,
  bypassCookie: null as string | null,
  bypassSecret: SECRET as string | undefined,
};

describe("preCheckMaintenance — Edge Config 읽기 전 1차 판정", () => {
  it("일반 화면은 설정을 확인해야 한다", () => {
    expect(preCheckMaintenance(base)).toBe("check-config");
  });

  it.each(["/api/revalidate", "/api/cron/batch", "/api/mcp/x"])(
    "%s — API는 점검 중에도 통과한다 (cron·웹훅 유지)",
    (pathname) => {
      expect(preCheckMaintenance({ ...base, pathname })).toBe("pass");
    },
  );

  it("점검 페이지 자신은 통과한다 — 무한 루프 방지", () => {
    expect(preCheckMaintenance({ ...base, pathname: "/maintenance" })).toBe("pass");
  });

  it("?bypass=비밀값 이면 쿠키를 심는다", () => {
    expect(preCheckMaintenance({ ...base, bypassParam: SECRET })).toBe("grant-bypass");
  });

  it("bypass 쿠키가 있으면 통과한다", () => {
    expect(preCheckMaintenance({ ...base, bypassCookie: SECRET })).toBe("pass");
  });

  it("비밀값이 틀리면 통하지 않는다", () => {
    expect(preCheckMaintenance({ ...base, bypassParam: "wrong" })).toBe("check-config");
    expect(preCheckMaintenance({ ...base, bypassCookie: "wrong" })).toBe("check-config");
  });

  it("서버에 비밀값이 없으면 아무 bypass도 먹지 않는다 — 빈 값끼리 맞아떨어지지 않게", () => {
    expect(
      preCheckMaintenance({ ...base, bypassSecret: undefined, bypassParam: "" }),
    ).toBe("check-config");
    expect(
      preCheckMaintenance({ ...base, bypassSecret: undefined, bypassCookie: "" }),
    ).toBe("check-config");
  });
});

describe("isMaintenanceActive — fail-open", () => {
  it("Edge Config 를 못 읽으면(null) 정상 서비스한다", () => {
    expect(isMaintenanceActive(null)).toBe(false);
  });

  it("enabled 가 true 일 때만 막는다", () => {
    expect(isMaintenanceActive({ enabled: true, until: null })).toBe(true);
    expect(isMaintenanceActive({ enabled: false, until: null })).toBe(false);
  });
});

describe("formatMaintenanceUntil — KST 고정", () => {
  const now = dayjs.tz("2026-09-23 21:00", "Asia/Seoul");

  it("시각이 없으면 null — 문구가 '곧 돌아올게요'로 떨어진다", () => {
    expect(formatMaintenanceUntil(null, now)).toBeNull();
    expect(formatMaintenanceUntil("", now)).toBeNull();
    expect(formatMaintenanceUntil("   ", now)).toBeNull();
  });

  it("같은 날이면 시각만 — 한국시간 그대로 넣은 값이 안 밀린다", () => {
    expect(formatMaintenanceUntil("2026-09-23 22:00", now)).toBe("오후 10시");
    expect(formatMaintenanceUntil("2026-09-23 22:30", now)).toBe("오후 10시 30분");
  });

  it("다른 날이면 날짜까지 붙인다", () => {
    expect(formatMaintenanceUntil("2026-09-24 02:00", now)).toBe("9월 24일 오전 2시");
  });

  it("이미 지난 시각은 숨긴다 — 지나간 약속을 계속 보여주는 게 제일 나쁘다", () => {
    expect(formatMaintenanceUntil("2026-09-23 20:00", now)).toBeNull();
  });

  it("형식이 깨졌으면 조용히 null", () => {
    expect(formatMaintenanceUntil("내일까지", now)).toBeNull();
    expect(formatMaintenanceUntil("2026-13-45 99:99", now)).toBeNull();
  });
});

describe("MaintenanceConfig 타입 계약", () => {
  it("until 은 선택값이다", () => {
    const cfg: MaintenanceConfig = { enabled: true, until: null };
    expect(cfg.until).toBeNull();
  });
});
