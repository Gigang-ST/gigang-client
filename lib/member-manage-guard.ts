/**
 * 관리자 회원 화면 — **비활성·탈퇴·삭제**를 이 대상에게 할 수 있는가.
 *
 * 운영진(admin)은 다른 운영진을 비활성·탈퇴·삭제할 수 없다 — **크루장(owner)만** 운영진에게 이 처리를 한다
 * (#676, 오너 결정 2026-11-16). 예전엔 크루장만 보호돼 운영진끼리 서로 내보낼 수 있었다.
 * 크루장 자신과 본인은 누구도 처리할 수 없다(기존 규칙).
 *
 * **관리자 해제(운영진 → 일반 회원)는 여기서 다루지 않는다** — 그 규칙은 `toggleAdmin` 그대로다.
 * 재활성화도 대상이 아니다(되돌리는 쪽이라 막을 이유가 없다).
 *
 * 서버 액션(단건·일괄)과 화면이 같은 판정을 써야 한다 — 화면만 숨기면 액션을 직접 부를 수 있고,
 * 서버만 막으면 운영진이 눌러 보고 나서야 안 되는 걸 안다.
 */

export type ManageActor = { memId: string; isOwner: boolean };
export type ManageTarget = { memId: string; roleCd: string | null };

export const PROTECTED_ADMIN_MESSAGE = "운영진은 크루장만 비활성·탈퇴·삭제할 수 있어요";

/** 막히면 이유 문구, 할 수 있으면 null */
export function memberRemovalBlockReason(actor: ManageActor, target: ManageTarget): string | null {
  if (target.roleCd === "owner") return "크루장은 비활성·탈퇴·삭제할 수 없어요";
  if (target.memId === actor.memId) return "본인은 비활성·탈퇴·삭제할 수 없어요";
  if (target.roleCd === "admin" && !actor.isOwner) return PROTECTED_ADMIN_MESSAGE;
  return null;
}
