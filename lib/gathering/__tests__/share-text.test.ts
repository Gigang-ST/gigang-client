import { describe, expect, it } from "vitest";
import {
  buildGatheringCancelText,
  buildGatheringShareText,
  buildGatheringShareUrl,
  buildGatheringUpdateText,
  detectGatheringChanges,
  shouldSendAfterThrottle,
} from "@/lib/gathering/share-text";

// 2026-09-25(금) 19:30 KST = 10:30Z
const STT = "2026-09-25T10:30:00.000Z";
const END = "2026-09-25T12:00:00.000Z";

describe("buildGatheringShareText", () => {
  it("제목·일시·장소·개설자를 KST로 찍는다", () => {
    const text = buildGatheringShareText({
      title: "🔥 정기 기강런",
      sttAt: STT,
      endAt: END,
      location: "여의도공원",
      authorName: "홍길동",
      url: "https://gigang.team/schedule?gthr=abc",
    });

    expect(text).toContain("🏃‍♂️ 같이 뛰어요!");
    expect(text).toContain("「🔥 정기 기강런」");
    // 서버(UTC)에서 조립해도 KST 19:30 이어야 한다 — 이게 깨지면 톡방 공지가 9시간 어긋난다
    expect(text).toContain("🗓 9/25 (금) 오후 7:30 ~ 오후 9:00");
    expect(text).toContain("📍 여의도공원");
    expect(text).toContain("🙋 홍길동");
    expect(text).toContain("https://gigang.team/schedule?gthr=abc");
  });

  it("참석 1명이면 인원 줄을 뺀다 — 처음 공유는 항상 작성자뿐이라 적을 값이 없다", () => {
    const text = buildGatheringShareText({ title: "번개", sttAt: STT, attendeeCount: 1 });
    expect(text).not.toContain("👥");
  });

  it("참석 2명 이상이면 정원과 함께 적는다", () => {
    const text = buildGatheringShareText({
      title: "번개",
      sttAt: STT,
      attendeeCount: 3,
      maxCount: 10,
    });
    expect(text).toContain("👥 3/10명");
  });

  it("정원이 없으면 인원만 적는다", () => {
    const text = buildGatheringShareText({ title: "번개", sttAt: STT, attendeeCount: 3 });
    expect(text).toContain("👥 3명");
  });

  it("종료가 다른 날이면 날짜까지 적는다", () => {
    const text = buildGatheringShareText({
      title: "울트라",
      sttAt: "2026-09-25T20:00:00.000Z", // KST 9/26 05:00
      endAt: "2026-09-26T09:00:00.000Z", // KST 9/26 18:00
    });
    expect(text).toContain("9/26 (토) 오전 5:00 ~ 오후 6:00");
  });

  it("URL이 없으면 링크 줄을 빼고 조립한다", () => {
    const text = buildGatheringShareText({ title: "번개", sttAt: STT });
    expect(text).not.toContain("참여하기");
  });
});

describe("buildGatheringShareUrl", () => {
  it("일정 페이지 딥링크를 만든다", () => {
    expect(buildGatheringShareUrl("https://gigang.team", "abc")).toBe(
      "https://gigang.team/schedule?gthr=abc",
    );
  });

  it("origin 끝 슬래시를 흡수한다", () => {
    expect(buildGatheringShareUrl("https://gigang.team/", "abc")).toBe(
      "https://gigang.team/schedule?gthr=abc",
    );
  });
});

describe("buildGatheringUpdateText", () => {
  it("바뀐 항목을 제목 줄에서 밝힌다", () => {
    expect(buildGatheringUpdateText({ title: "번개", sttAt: STT }, ["time"])).toContain(
      "📢 모임 일시가 변경됐어요",
    );
    expect(buildGatheringUpdateText({ title: "번개", sttAt: STT }, ["location"])).toContain(
      "📢 모임 장소가 변경됐어요",
    );
    expect(
      buildGatheringUpdateText({ title: "번개", sttAt: STT }, ["time", "location"]),
    ).toContain("📢 모임 일시·장소가 변경됐어요");
  });

  it("바뀐 뒤의 값과 링크를 싣는다", () => {
    const text = buildGatheringUpdateText(
      { title: "번개", sttAt: STT, location: "탄천", url: "https://gigang.team/schedule?gthr=abc" },
      ["location"],
    );
    expect(text).toContain("📍 탄천");
    expect(text).toContain("확인하기 👇");
  });
});

describe("buildGatheringCancelText", () => {
  it("링크를 붙이지 않는다 — 눌러 봐야 없는 모임이다", () => {
    const text = buildGatheringCancelText({
      title: "번개",
      sttAt: STT,
      location: "여의도",
      url: "https://gigang.team/schedule?gthr=abc",
    });
    expect(text).toContain("❌ 모임이 취소됐어요");
    expect(text).toContain("📍 여의도");
    expect(text).not.toContain("gigang.team");
  });
});

describe("detectGatheringChanges", () => {
  it("아무것도 안 바뀌면 빈 배열", () => {
    expect(
      detectGatheringChanges(
        { sttAt: STT, endAt: END, location: "여의도" },
        { sttAt: STT, endAt: END, location: "여의도" },
      ),
    ).toEqual([]);
  });

  it("표기만 다른 같은 절대시각은 변경이 아니다", () => {
    // 한쪽은 UTC ISO, 다른 쪽은 KST 오프셋 표기 — 문자열 비교였으면 늘 '바뀜'이 된다
    expect(
      detectGatheringChanges(
        { sttAt: "2026-09-25T10:30:00.000Z" },
        { sttAt: "2026-09-25T19:30:00+09:00" },
      ),
    ).toEqual([]);
  });

  it("시작 시각이 바뀌면 time", () => {
    expect(
      detectGatheringChanges({ sttAt: STT }, { sttAt: "2026-09-25T11:30:00.000Z" }),
    ).toEqual(["time"]);
  });

  it("종료 시각만 바뀌어도 time", () => {
    expect(
      detectGatheringChanges({ sttAt: STT, endAt: END }, { sttAt: STT, endAt: null }),
    ).toEqual(["time"]);
  });

  it("장소가 바뀌면 location", () => {
    expect(
      detectGatheringChanges({ sttAt: STT, location: null }, { sttAt: STT, location: "탄천" }),
    ).toEqual(["location"]);
  });

  it("둘 다 바뀌면 둘 다", () => {
    expect(
      detectGatheringChanges(
        { sttAt: STT, location: "여의도" },
        { sttAt: "2026-09-26T10:30:00.000Z", location: "탄천" },
      ),
    ).toEqual(["time", "location"]);
  });
});

describe("shouldSendAfterThrottle", () => {
  const now = new Date("2026-09-21T00:20:00.000Z");

  it("보낸 적 없으면 보낸다", () => {
    expect(shouldSendAfterThrottle(null, now)).toBe(true);
  });

  it("10분 안에 보냈으면 건너뛴다", () => {
    expect(shouldSendAfterThrottle("2026-09-21T00:15:00.000Z", now)).toBe(false);
  });

  it("정확히 10분이면 보낸다", () => {
    expect(shouldSendAfterThrottle("2026-09-21T00:10:00.000Z", now)).toBe(true);
  });

  it("10분이 지났으면 보낸다", () => {
    expect(shouldSendAfterThrottle("2026-09-21T00:05:00.000Z", now)).toBe(true);
  });

  it("값이 깨져 있으면 막지 않는다 — 알림 유실보다 낫다", () => {
    expect(shouldSendAfterThrottle("깨진값", now)).toBe(true);
  });
});
