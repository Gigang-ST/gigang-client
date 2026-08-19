import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getMyInactiveReason` 이 **노출 판정을 직접 하지 않고** `getVisibleInactiveReason` 에
 * 맡기는지 — 즉 액션이 자기 규칙을 따로 갖지 않는지 본다.
 *
 * 규칙 자체의 경계(탈퇴 제외·공백 제외·재활성 잔여값)는 `lib/__tests__/inactive-notice.test.ts`
 * 가 맡는다. 여기서 다시 세면 규칙이 두 곳에 적히고, 액션만 고쳤을 때 통과해 버린다.
 */

const h = vi.hoisted(() => ({
  member: {
    id: "mem-1",
    status: "inactive" as string,
    inact_rsn_txt: null as string | null,
  },
}));

vi.mock("@/lib/actions/auth", () => ({
  // 실제 withMember 는 비로그인이면 throw — 이 테스트는 로그인 이후 분기만 본다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withMember: async (fn: any) => fn({ member: h.member, supabase: {} }),
}));

import { getMyInactiveReason } from "@/app/actions/member/get-inactive-reason";

beforeEach(() => {
  h.member.status = "inactive";
  h.member.inact_rsn_txt = null;
});

describe("getMyInactiveReason", () => {
  it("비활성 회원에게는 사유를 돌려준다", async () => {
    h.member.inact_rsn_txt = "3개월 이상 모임 미참여";
    await expect(getMyInactiveReason()).resolves.toEqual({
      reason: "3개월 이상 모임 미참여",
    });
  });

  it("탈퇴(left) 회원에게는 돌려주지 않는다 — 다이얼로그가 kind 로는 못 거르는 경계다", async () => {
    h.member.status = "left";
    h.member.inact_rsn_txt = "관리자 탈퇴 처리";
    await expect(getMyInactiveReason()).resolves.toEqual({ reason: null });
  });
});
