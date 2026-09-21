import { beforeEach, describe, expect, it, vi } from "vitest";

const sendKakao = vi.hoisted(() => vi.fn());
vi.mock("@/lib/kakao/notify", () => ({ sendKakao }));

import {
  notifyGatheringCanceled,
  notifyGatheringUpdated,
} from "@/lib/gathering/kakao-dispatch";

const STT = "2026-09-25T10:30:00.000Z";

describe("notifyGatheringUpdated", () => {
  beforeEach(() => {
    sendKakao.mockReset().mockResolvedValue({ ok: true });
  });

  it("일시·장소가 안 바뀌었으면 보내지 않는다", async () => {
    await notifyGatheringUpdated({
      gthrId: "g1",
      title: "번개",
      sttAt: STT,
      location: "여의도",
      prev: { sttAt: STT, location: "여의도" },
    });

    expect(sendKakao).not.toHaveBeenCalled();
  });

  it("연달아 고쳐도 매번 보낸다 — 묶음 창을 두지 않는다", async () => {
    // 고치고 바로 또 고치는 건 사람이 헷갈리는 중이라는 뜻이다. 중간을 삼키면
    // 톡방에 남은 마지막 안내가 틀린 값이 된다.
    await notifyGatheringUpdated({
      gthrId: "g1",
      title: "번개",
      sttAt: STT,
      location: "탄천",
      prev: { sttAt: STT, location: "여의도" },
    });
    await notifyGatheringUpdated({
      gthrId: "g1",
      title: "번개",
      sttAt: STT,
      location: "한강",
      prev: { sttAt: STT, location: "탄천" },
    });

    expect(sendKakao).toHaveBeenCalledTimes(2);
    expect(sendKakao.mock.calls[1][0]).toContain("📍 한강");
  });

  it("링크는 origin·ref 가 둘 다 있을 때만 붙인다", async () => {
    await notifyGatheringUpdated({
      gthrId: "g1",
      ref: "abc",
      origin: "https://dev.gigang.team",
      title: "번개",
      sttAt: STT,
      location: "탄천",
      prev: { sttAt: STT, location: "여의도" },
    });

    expect(sendKakao.mock.calls[0][0]).toContain("https://dev.gigang.team/schedule?gthr=abc");
  });
});

describe("notifyGatheringCanceled", () => {
  beforeEach(() => {
    sendKakao.mockReset().mockResolvedValue({ ok: true });
  });

  it("변경 판정 없이 언제나 보낸다", async () => {
    await notifyGatheringCanceled({ gthrId: "g1", title: "번개", sttAt: STT });

    expect(sendKakao).toHaveBeenCalledTimes(1);
    expect(sendKakao.mock.calls[0][0]).toContain("❌ 모임이 취소됐어요");
  });
});
