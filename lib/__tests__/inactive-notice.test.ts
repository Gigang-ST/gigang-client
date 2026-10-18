import { describe, expect, it } from "vitest";

import {
  INACTIVE_ACTION_MESSAGE,
  LEFT_ACTION_MESSAGE,
  REACTIVATION_COPY,
  buildDuesLeaveReason,
  buildInactiveActionMessage,
  getVisibleInactiveReason,
  statusReasonLabel,
} from "@/lib/inactive-notice";

/**
 * 비활성·탈퇴 사유가 **본인에게 어떻게 나가는지**를 못박는다.
 *
 * 눈으로는 못 지키는 종류다 — 화면엔 "사유 한 줄"만 보이고, 새는 경로(재활성 후 남은 옛 값)는
 * 그 계정으로 들어가 봐야 드러난다.
 *
 * ⚠️ **2026-10 방향 전환**: 예전엔 탈퇴 사유를 감췄다. 관리자 입력칸에 "본인에게 보여요"
 * 경고가 비활성 쪽에만 붙어 있어서였다. 이제 경고를 탈퇴 쪽에도 붙였으므로 탈퇴 사유도
 * 본인이 본다 — **왜 나가게 됐는지 모르면 재가입 요청을 할 수도 없다**(이슈 #571).
 * 전제가 바뀌었으니 이 판정도 바뀐다.
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

  it("탈퇴(left)도 사유를 받는다 — 모르면 재가입 요청을 할 수 없다", () => {
    expect(getVisibleInactiveReason(src("left", "회비 6,000원 미납으로 탈퇴 처리되었어요"))).toBe(
      "회비 6,000원 미납으로 탈퇴 처리되었어요",
    );
  });

  it("active 에는 옛 값이 남아 있어도 돌려주지 않는다", () => {
    expect(getVisibleInactiveReason(src("active", "장기 미참여"))).toBeNull();
  });

  it("비었거나 공백뿐이면 null — 빈 상자를 그리지 않게", () => {
    expect(getVisibleInactiveReason(src("inactive", null))).toBeNull();
    expect(getVisibleInactiveReason(src("inactive", "   "))).toBeNull();
    expect(getVisibleInactiveReason(src("left", "  "))).toBeNull();
  });
});

describe("statusReasonLabel — 사유 칸 제목", () => {
  it("탈퇴는 탈퇴 사유", () => {
    expect(statusReasonLabel("left")).toBe("탈퇴 사유");
  });

  it("그 밖은 비활성 사유", () => {
    expect(statusReasonLabel("inactive")).toBe("비활성 사유");
  });
});

describe("buildInactiveActionMessage — 서버 방어선 문구", () => {
  it("비활성은 사유를 문구에 끼워 넣는다", () => {
    expect(buildInactiveActionMessage(src("inactive", "회비 장기 미납"))).toBe(
      "비활성화된 회원입니다. (사유: 회비 장기 미납) 관리자에게 문의하세요.",
    );
  });

  it("사유가 없으면 기존 문구 그대로 — 빈 괄호를 남기지 않는다", () => {
    expect(buildInactiveActionMessage(src("inactive", null))).toBe(INACTIVE_ACTION_MESSAGE);
  });

  it("탈퇴는 탈퇴라고 말하고 재가입 요청으로 안내한다", () => {
    expect(buildInactiveActionMessage(src("left", "회비 6,000원 미납"))).toBe(
      "탈퇴한 회원입니다. (사유: 회비 6,000원 미납) 앱에서 재가입을 요청해 주세요.",
    );
  });

  it("사유 없는 탈퇴도 비활성 문구를 빌려 쓰지 않는다", () => {
    expect(buildInactiveActionMessage(src("left", null))).toBe(LEFT_ACTION_MESSAGE);
  });
});

describe("REACTIVATION_COPY — 두 차단면이 쓰는 한 벌", () => {
  it("탈퇴는 '재가입'이라고 말한다 — '문의'로 뭉치면 다시 들어올 수 있는 줄 모른다", () => {
    expect(REACTIVATION_COPY.left.cta).toContain("재가입");
    expect(REACTIVATION_COPY.left.sentTitle).toContain("재가입");
  });

  it("비활성은 '문의'다 — 재가입이 아니라 풀어 달라는 요청이다", () => {
    expect(REACTIVATION_COPY.inactive.cta).toContain("문의");
    expect(REACTIVATION_COPY.inactive.sentTitle).toContain("문의");
  });

  it("두 상태의 말이 서로 다르다 — 같으면 가를 이유가 없어진 것이다", () => {
    expect(REACTIVATION_COPY.left.cta).not.toBe(REACTIVATION_COPY.inactive.cta);
  });
});

describe("buildDuesLeaveReason — 회비 화면 자동 사유", () => {
  it("본인이 읽는 문장으로 적는다 — '관리자 탈퇴 처리' 같은 내부 말투를 쓰지 않는다", () => {
    expect(buildDuesLeaveReason(6000)).toBe("회비 6,000원 미납으로 탈퇴 처리되었어요");
  });

  it("천 단위 구분을 넣는다", () => {
    expect(buildDuesLeaveReason(14000)).toBe("회비 14,000원 미납으로 탈퇴 처리되었어요");
  });
});
