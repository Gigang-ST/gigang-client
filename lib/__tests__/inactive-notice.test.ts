import { describe, expect, it } from "vitest";

import {
  INACTIVE_ACTION_MESSAGE,
  buildInactiveActionMessage,
  getVisibleInactiveReason,
} from "@/lib/inactive-notice";

/**
 * 비활성 사유가 **비활성 회원 본인에게만** 나가는지 못박는다.
 *
 * 눈으로는 못 지키는 종류다 — 화면엔 "사유 한 줄"만 보이고, 새는 경로(탈퇴 메모·재활성 후
 * 남은 옛 값)는 그 계정으로 들어가 봐야 드러난다. 특히 탈퇴 사유는 관리자 입력칸에
 * "본인에게 보여요" 경고가 없는 채로 적히므로, 여기서 막히지 않으면 안 알리고 노출된다.
 *
 * 이 판정 하나를 게이트 다이얼로그·프로필탭 차단 화면·서버 방어선(`withActive`)이 공유하므로,
 * 여기가 맞으면 세 표면이 함께 맞는다.
 */

const src = (status: string, inact_rsn_txt: string | null) => ({ status, inact_rsn_txt });

describe("getVisibleInactiveReason — 노출 경계", () => {
  it("비활성 회원은 관리자가 적은 사유를 그대로 받는다", () => {
    expect(getVisibleInactiveReason(src("inactive", "3개월 이상 모임 미참여"))).toBe(
      "3개월 이상 모임 미참여",
    );
  });

  it("탈퇴(left)에는 사유를 돌려주지 않는다 — 경고 없이 적힌 관리자 메모다", () => {
    expect(getVisibleInactiveReason(src("left", "관리자 탈퇴 처리"))).toBeNull();
  });

  it("active 에는 옛 값이 남아 있어도 돌려주지 않는다", () => {
    expect(getVisibleInactiveReason(src("active", "장기 미참여"))).toBeNull();
  });

  it("비었거나 공백뿐이면 null — 빈 상자를 그리지 않게", () => {
    expect(getVisibleInactiveReason(src("inactive", null))).toBeNull();
    expect(getVisibleInactiveReason(src("inactive", "   "))).toBeNull();
  });
});

describe("buildInactiveActionMessage — 서버 방어선 문구", () => {
  it("사유가 있으면 문구에 끼워 넣는다", () => {
    expect(buildInactiveActionMessage(src("inactive", "회비 장기 미납"))).toBe(
      "비활성화된 회원입니다. (사유: 회비 장기 미납) 관리자에게 문의하세요.",
    );
  });

  it("사유가 없으면 기존 문구 그대로 — 빈 괄호를 남기지 않는다", () => {
    expect(buildInactiveActionMessage(src("inactive", null))).toBe(INACTIVE_ACTION_MESSAGE);
  });

  it("탈퇴는 사유 없이 기존 문구 — 막는 사실만 말한다", () => {
    expect(buildInactiveActionMessage(src("left", "관리자 탈퇴 처리"))).toBe(
      INACTIVE_ACTION_MESSAGE,
    );
  });
});
