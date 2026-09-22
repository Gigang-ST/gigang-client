import { describe, expect, it } from "vitest";

import {
  buildGatheringMetadata,
  buildGatheringOgText,
  gatheringOgImagePath,
  getGatheringOgSport,
  OG_COLORS,
  type GatheringOgSource,
} from "@/lib/gathering-og";

function src(over: Partial<GatheringOgSource> = {}): GatheringOgSource {
  return {
    gthr_id: "9f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607",
    short_id: "9klzyNd",
    gthr_nm: "수요 한강 나이트런 10K",
    loc_txt: "뚝섬유원지역 3번 출구",
    // 2026-09-24 20:00 KST
    stt_at: "2026-09-24T11:00:00+00:00",
    sprt_cd: "running",
    upd_at: "2026-09-20T03:00:00+00:00",
    ...over,
  };
}

describe("buildGatheringOgText", () => {
  it("시각은 KST로, 설명은 `언제 · 어디서`", () => {
    const t = buildGatheringOgText(src());
    expect(t.whenLabel).toBe("9월 24일 (목) 오후 8:00");
    expect(t.description).toBe("9월 24일 (목) 오후 8:00 · 뚝섬유원지역 3번 출구");
    expect(t.timeLabel).toBe("오후 8:00");
    expect(t.month).toBe("SEP");
    expect(t.day).toBe("24");
    expect(t.weekday).toBe("목요일");
  });

  it("KST 00~09시 모임이 UTC 전날로 밀리지 않는다", () => {
    // 2026-09-24 00:30 KST = 2026-09-23 15:30 UTC — 서버(UTC)에서 로컬 format이면 23일로 찍힌다
    const t = buildGatheringOgText(src({ stt_at: "2026-09-23T15:30:00+00:00" }));
    expect(t.day).toBe("24");
    expect(t.whenLabel).toBe("9월 24일 (목) 오전 12:30");
  });

  it("장소가 없거나 공백이면 설명에 ` · `를 남기지 않는다", () => {
    expect(buildGatheringOgText(src({ loc_txt: null })).description).toBe("9월 24일 (목) 오후 8:00");
    expect(buildGatheringOgText(src({ loc_txt: "   " })).description).toBe("9월 24일 (목) 오후 8:00");
    expect(buildGatheringOgText(src({ loc_txt: "   " })).location).toBeNull();
  });

  it("월 약어는 12월까지 영문", () => {
    expect(buildGatheringOgText(src({ stt_at: "2026-12-31T10:00:00+00:00" })).month).toBe("DEC");
    expect(buildGatheringOgText(src({ stt_at: "2026-01-01T10:00:00+00:00" })).month).toBe("JAN");
  });
});

describe("getGatheringOgSport", () => {
  it("종목 코드 → 라벨·색. 밝은 색 위엔 어두운 글자", () => {
    expect(getGatheringOgSport("running")).toMatchObject({ label: "러닝", fg: "#ffffff" });
    expect(getGatheringOgSport("cycling")).toMatchObject({ label: "자전거", fg: "#ffffff" });
    expect(getGatheringOgSport("trail_run")).toMatchObject({ label: "트레일러닝", fg: OG_COLORS.board });
    expect(getGatheringOgSport("hyrox")).toMatchObject({ label: "하이록스", fg: OG_COLORS.board });
  });

  it("모르는 코드·null은 primary 기본 블록", () => {
    expect(getGatheringOgSport(null)).toMatchObject({ label: "모임", bg: OG_COLORS.primary });
    expect(getGatheringOgSport("skiing")).toMatchObject({ label: "모임", bg: OG_COLORS.primary });
  });

  it("색은 hex — Satori가 oklch를 못 읽는다", () => {
    for (const code of ["running", "trail_run", "cycling", "swimming", "hyrox", null]) {
      const s = getGatheringOgSport(code);
      expect(s.bg).toMatch(/^#[0-9a-f]{6}$/);
      expect(s.fg).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("gatheringOgImagePath", () => {
  it("short_id 우선, v는 upd_at 초 단위 — 고치면 URL이 바뀐다", () => {
    expect(gatheringOgImagePath(src())).toBe("/api/og/gathering?g=9klzyNd&v=1789873200");
    expect(gatheringOgImagePath(src({ upd_at: "2026-09-21T03:00:00+00:00" }))).toBe(
      "/api/og/gathering?g=9klzyNd&v=1789959600",
    );
  });

  it("short_id가 없으면 uuid, upd_at이 없으면 v=0", () => {
    expect(gatheringOgImagePath(src({ short_id: null, upd_at: null }))).toBe(
      "/api/og/gathering?g=9f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607&v=0",
    );
  });
});

describe("buildGatheringMetadata", () => {
  it("제목·설명·이미지가 한 출처에서 나오고 canonical은 /schedule 고정", () => {
    const m = buildGatheringMetadata(src());
    expect(m.title).toBe("수요 한강 나이트런 10K");
    expect(m.description).toBe("9월 24일 (목) 오후 8:00 · 뚝섬유원지역 3번 출구");
    expect(m.alternates?.canonical).toBe("/schedule");

    const og = m.openGraph as { title: string; images: { url: string; width: number; height: number; alt: string }[]; siteName: string; locale: string };
    expect(og.title).toBe("수요 한강 나이트런 10K");
    expect(og.images[0]).toMatchObject({ url: "/api/og/gathering?g=9klzyNd&v=1789873200", width: 1200, height: 630 });
    expect(og.images[0].alt).toBe("수요 한강 나이트런 10K — 9월 24일 (목) 오후 8:00");
    // 루트 openGraph와 깊은 병합이 안 되므로 여기서 다시 채워야 하는 값들
    expect(og.siteName).toBe("기강");
    expect(og.locale).toBe("ko_KR");

    const tw = m.twitter as { card: string; images: string[] };
    expect(tw.card).toBe("summary_large_image");
    expect(tw.images[0]).toBe("/api/og/gathering?g=9klzyNd&v=1789873200");
  });
});
