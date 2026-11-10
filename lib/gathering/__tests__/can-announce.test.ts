import { describe, expect, it } from "vitest";

import { canAnnounceToKakao } from "@/lib/gathering/can-announce";

/**
 * 「단톡방에 알림」 버튼 — 노티봇을 안 쓰는 팀(카톡 공지방 없음, 울산)엔 서지 않는다.
 */
const ACTIVE = { kakaoAnnounce: true, currentMemberId: "mem-1", viewerInactive: false, isPastLocked: false };

describe("canAnnounceToKakao", () => {
  it("노티봇을 쓰는 팀의 활동 멤버는 다가오는 모임을 알릴 수 있다", () => {
    expect(canAnnounceToKakao(ACTIVE)).toBe(true);
  });

  it("카톡 공지방이 없는 팀은 누구에게도 버튼이 안 선다", () => {
    expect(canAnnounceToKakao({ ...ACTIVE, kakaoAnnounce: false })).toBe(false);
  });

  it("비로그인·비활성·지난 모임은 안 된다(노티봇을 쓰는 팀이어도)", () => {
    expect(canAnnounceToKakao({ ...ACTIVE, currentMemberId: undefined })).toBe(false);
    expect(canAnnounceToKakao({ ...ACTIVE, viewerInactive: true })).toBe(false);
    expect(canAnnounceToKakao({ ...ACTIVE, isPastLocked: true })).toBe(false);
  });
});
