/**
 * 비활성 사유를 **누구에게 어떻게 보여줄지**를 정하는 한 곳.
 *
 * 비활성 회원이 막히는 자리는 여럿이다 — 참여 게이트 다이얼로그, 프로필탭 전면 차단 화면,
 * 그리고 클라이언트 게이트를 우회했을 때 서버가 던지는 문구(`withActive`). 각자 사유를
 * 꺼내 쓰면 "탈퇴는 빼고"·"공백뿐이면 빼고" 같은 규칙을 한 곳만 고쳐 어긋난다.
 *
 * **탈퇴(`left`)는 돌려주지 않는다.** `inact_rsn_txt` 컬럼 하나가 두 상태를 겸하지만,
 * 관리자 입력칸의 "본인에게 보여요" 경고는 비활성 쪽에만 붙어 있다. 경고 없이 적힌 탈퇴
 * 메모가 새지 않으려면 **상태로 잘라야** 하고, 그 판정은 여기 하나뿐이어야 한다.
 */

/** 사유 노출 판정에 필요한 최소 표면 — `AppMemberProfile` 이 그대로 들어맞는다. */
export type InactiveNoticeSource = {
  status: string;
  inact_rsn_txt: string | null;
};

/**
 * 본인에게 보여도 되는 비활성 사유. 비활성이 아니거나 사유가 비었으면 `null`.
 *
 * 재활성화가 컬럼을 null 로 비우긴 하지만, 상태가 진실이므로 옛 값이 남은 행이 있어도
 * 여기서 걸러진다.
 */
export function getVisibleInactiveReason(member: InactiveNoticeSource): string | null {
  if (member.status !== "inactive") return null;
  const reason = member.inact_rsn_txt?.trim();
  return reason ? reason : null;
}

/** 사유가 없을 때의 기본 문구 — 서버 방어선이 던지던 기존 메시지 그대로. */
export const INACTIVE_ACTION_MESSAGE = "비활성화된 회원입니다. 관리자에게 문의하세요.";

/**
 * 서버가 쓰기를 막을 때 돌려주는 문구. 사유가 있으면 끼워 넣는다.
 *
 * 이 문구는 `withActive` 를 쓰는 액션 전부(기강이야기 응원·팻말·한마디·깅스타그램 포함)가
 * 공유하므로, 여기 사유를 넣으면 다이얼로그가 없는 자리까지 한 번에 이유를 말하게 된다.
 */
export function buildInactiveActionMessage(member: InactiveNoticeSource): string {
  const reason = getVisibleInactiveReason(member);
  if (!reason) return INACTIVE_ACTION_MESSAGE;
  return `비활성화된 회원입니다. (사유: ${reason}) 관리자에게 문의하세요.`;
}
