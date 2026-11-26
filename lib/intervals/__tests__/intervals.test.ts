import { describe, expect, it, vi } from "vitest";

import {
  IntervalsAuthError,
  IntervalsFetchError,
  fetchIntervalsActivities,
  toActivitySummary,
} from "@/lib/intervals/client";
import { decryptApiKey, encryptApiKey } from "@/lib/intervals/crypto";
import { formatDistanceKm, formatDuration, formatPace, sportLabel, toSummaryJson } from "@/lib/intervals/summary";

const SECRET = "test-secret-0123456789abcdef";

describe("암호화", () => {
  it("암호화한 키를 같은 비밀로 복호화한다", () => {
    const enc = encryptApiKey("my-api-key-123", SECRET);
    expect(enc).not.toContain("my-api-key-123");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptApiKey(enc, SECRET)).toBe("my-api-key-123");
  });

  it("같은 키도 매번 다른 암호문이 나온다(iv 무작위)", () => {
    expect(encryptApiKey("k-12345678", SECRET)).not.toBe(encryptApiKey("k-12345678", SECRET));
  });

  it("다른 비밀이나 깨진 값은 평문 없이 던진다", () => {
    const enc = encryptApiKey("secret-value-xyz", SECRET);
    expect(() => decryptApiKey(enc, "another-secret-0123456789")).toThrow("복호화");
    expect(() => decryptApiKey("garbage", SECRET)).toThrow();
    try {
      decryptApiKey(enc, "another-secret-0123456789");
    } catch (e) {
      expect(String(e)).not.toContain("secret-value-xyz");
    }
  });

  it("너무 짧은 비밀은 거부한다", () => {
    expect(() => encryptApiKey("x", "short")).toThrow();
  });
});

describe("활동 요약 변환", () => {
  it("필요한 칸만 뽑고 날짜는 현지 날짜 앞 10자리다", () => {
    expect(
      toActivitySummary({
        id: "i123",
        start_date_local: "2026-11-25T06:30:00",
        type: "Run",
        distance: 10234.5,
        moving_time: 3000.4,
        average_speed: 3.41,
        icu_average_hr: 150,
        name: "아침 조깅",
      }),
    ).toEqual({
      icu_act_id: "i123",
      act_dt: "2026-11-25",
      sprt_type_nm: "Run",
      dst_m: 10234.5,
      mov_sec: 3000,
      avg_spd_mps: 3.41,
    });
  });

  it("id·날짜가 없으면 버리고, 거리 없는 운동은 null 로 남긴다", () => {
    expect(toActivitySummary({ type: "Run" })).toBeNull();
    expect(toActivitySummary(null)).toBeNull();
    expect(toActivitySummary({ id: 5, start_date_local: "2026-11-01T00:00:00", type: "WeightTraining" })).toMatchObject({
      icu_act_id: "5",
      dst_m: null,
      mov_sec: null,
    });
  });
});

describe("intervals.icu 호출", () => {
  const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

  it("Basic 인증으로 요약 칸만 요청한다(심박·경로 칸은 요청하지 않는다)", async () => {
    const f = vi.fn().mockImplementation(() => ok([{ id: "a1", start_date_local: "2026-11-20T07:00:00", type: "Run" }]));
    const out = await fetchIntervalsActivities("KEY123456", { oldest: "2026-10-01", newest: "2026-11-26" }, f);
    expect(out).toHaveLength(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/athlete/0/activities?oldest=2026-10-01&newest=2026-11-26&fields=");
    expect(url).not.toMatch(/hr|heart|stream|latlng/i);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("API_KEY:KEY123456").toString("base64")}`);
  });

  it("401·403 은 인증 오류, 그 밖은 일반 오류이며 키가 메시지에 없다", async () => {
    const range = { oldest: "2026-10-01", newest: "2026-11-26" };
    await expect(fetchIntervalsActivities("KEY123456", range, () => ok({}, 401))).rejects.toBeInstanceOf(IntervalsAuthError);
    await expect(fetchIntervalsActivities("KEY123456", range, () => ok({}, 403))).rejects.toBeInstanceOf(IntervalsAuthError);
    const err = await fetchIntervalsActivities("KEY123456", range, () => ok({}, 500)).catch((e) => e);
    expect(err).toBeInstanceOf(IntervalsFetchError);
    expect(String(err.message)).not.toContain("KEY123456");
    const netErr = await fetchIntervalsActivities("KEY123456", range, () => Promise.reject(new Error("boom KEY123456"))).catch((e) => e);
    expect(netErr).toBeInstanceOf(IntervalsFetchError);
    expect(String(netErr.message)).not.toContain("KEY123456");
  });
});

describe("표시 규칙", () => {
  it("종목별 페이스 단위", () => {
    expect(formatPace("Run", 3.333)).toBe("5:00/km");
    expect(formatPace("TrailRun", 2.5)).toBe("6:40/km");
    expect(formatPace("Swim", 0.8)).toBe("2:05/100m");
    expect(formatPace("Ride", 7.5)).toBe("27.0km/h");
    expect(formatPace("WeightTraining", 1)).toBeNull();
    expect(formatPace("Run", null)).toBeNull();
  });

  it("거리·시간·종목 라벨", () => {
    expect(formatDistanceKm(10234)).toBe("10.2km");
    expect(formatDistanceKm(0)).toBeNull();
    expect(formatDuration(3930)).toBe("1:05:30");
    expect(formatDuration(1930)).toBe("32:10");
    expect(sportLabel("Run")).toBe("러닝");
    expect(sportLabel("Unknown")).toBe("운동");
  });

  it("MCP 응답 요약엔 날짜·종목·거리·시간·페이스만 있다", () => {
    const json = toSummaryJson({
      icu_act_id: "i1",
      act_dt: "2026-11-25",
      sprt_type_nm: "Run",
      dst_m: 10000,
      mov_sec: 3000,
      avg_spd_mps: 3.333,
    });
    expect(Object.keys(json).sort()).toEqual(["date", "distance_km", "duration", "pace", "sport", "sport_label"]);
    expect(json.pace).toBe("5:00/km");
    expect(json.distance_km).toBe(10);
  });
});
