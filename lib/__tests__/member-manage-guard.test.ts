import { describe, expect, it } from "vitest";

import { memberRemovalBlockReason, PROTECTED_ADMIN_MESSAGE } from "@/lib/member-manage-guard";

const owner = { memId: "o", isOwner: true };
const admin = { memId: "a", isOwner: false };

describe("memberRemovalBlockReason — 비활성·탈퇴·삭제 가능 판정", () => {
  it("운영진은 다른 운영진을 처리할 수 없다", () => {
    expect(memberRemovalBlockReason(admin, { memId: "b", roleCd: "admin" })).toBe(PROTECTED_ADMIN_MESSAGE);
  });

  it("크루장은 운영진을 처리할 수 있다", () => {
    expect(memberRemovalBlockReason(owner, { memId: "b", roleCd: "admin" })).toBeNull();
  });

  it("일반 회원은 운영진·크루장 누구나 처리할 수 있다", () => {
    expect(memberRemovalBlockReason(admin, { memId: "m", roleCd: "member" })).toBeNull();
    expect(memberRemovalBlockReason(owner, { memId: "m", roleCd: "member" })).toBeNull();
  });

  it("크루장 자신은 누구도 처리할 수 없다", () => {
    expect(memberRemovalBlockReason(admin, { memId: "o", roleCd: "owner" })).not.toBeNull();
    expect(memberRemovalBlockReason(owner, { memId: "o", roleCd: "owner" })).not.toBeNull();
  });

  it("본인은 처리할 수 없다", () => {
    expect(memberRemovalBlockReason(owner, { memId: "o", roleCd: "admin" })).not.toBeNull();
    expect(memberRemovalBlockReason(admin, { memId: "a", roleCd: "admin" })).not.toBeNull();
  });
});
