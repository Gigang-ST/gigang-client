/**
 * 비활성·탈퇴 사유를 **누구에게 어떻게 보여줄지**를 정하는 한 곳.
 *
 * 막히는 자리는 여럿이다 — 참여 게이트 다이얼로그, 프로필탭 전면 차단 화면, 그리고 클라이언트
 * 게이트를 우회했을 때 서버가 던지는 문구(`withActive`). 각자 사유를 꺼내 쓰면 "공백뿐이면
 * 빼고" 같은 규칙을 한 곳만 고쳐 어긋난다.
 *
 * ⚠️ **2026-10 방향 전환(이슈 #571): 탈퇴(`left`) 사유도 본인에게 보여준다.**
 * 예전엔 감췄다 — `inact_rsn_txt` 컬럼 하나가 두 상태를 겸하는데 관리자 입력칸의
 * "본인에게 보여요" 경고가 비활성 쪽에만 붙어 있어서, 경고 없이 적힌 탈퇴 메모가 새지
 * 않게 상태로 잘랐다. 이제 **경고를 탈퇴 쪽에도 붙였으므로** 그 전제가 사라졌고,
 * 감추는 쪽이 더 해롭다: 왜 나가게 됐는지 모르면 재가입 요청조차 할 수 없다.
 * (배포 전 prd 기존 탈퇴 사유를 사람이 읽을 문장으로 한 번 훑어야 한다.)
 */

/** 사유 노출 판정에 필요한 최소 표면 — `AppMemberProfile` 이 그대로 들어맞는다. */
export type InactiveNoticeSource = {
  status: string;
  inact_rsn_txt: string | null;
};

/**
 * 본인에게 보여도 되는 사유. 활동 중이거나 사유가 비었으면 `null`.
 *
 * 재활성화가 컬럼을 null 로 비우긴 하지만, 상태가 진실이므로 옛 값이 남은 행이 있어도
 * 여기서 걸러진다.
 */
export function getVisibleInactiveReason(member: InactiveNoticeSource): string | null {
  if (member.status !== "inactive" && member.status !== "left") return null;
  const reason = member.inact_rsn_txt?.trim();
  return reason ? reason : null;
}

/**
 * 사유 칸 제목 — 같은 조각(`InactiveReasonNote`)이 두 상태에 서므로 말만 갈아 끼운다.
 * 탈퇴 화면에 "비활성 사유"라고 적혀 있으면 자기 얘기가 아닌 줄 안다.
 */
export function statusReasonLabel(status: string): string {
  return status === "left" ? "탈퇴 사유" : "비활성 사유";
}

/**
 * 차단 화면의 요청 버튼 문구 — **상태마다 하는 일이 다르다.**
 * 비활성은 "문의"(풀어 달라), 탈퇴는 "재가입 요청"(다시 넣어 달라)이다. 한 말로 뭉치면
 * 탈퇴한 사람은 자기가 다시 들어올 수 있다는 걸 모른 채 "문의"만 보고 지나친다.
 *
 * 쓰는 곳이 둘이다: 참여 게이트 다이얼로그(`InactiveGateDialog`)와 프로필탭 전면 차단
 * 화면(`ReactivationRequestButton`). **같은 사건을 두 화면이 다른 말로 부르면 안 되므로**
 * 각자 상수를 들지 않고 여기 하나를 본다 — 둘은 같은 액션(`requestReactivation`)을 부른다.
 */
export const REACTIVATION_COPY = {
  inactive: { cta: "관리자에게 문의하기", sentTitle: "문의를 보냈어요" },
  left: { cta: "재가입 요청하기", sentTitle: "재가입을 요청했어요" },
} as const;

/** 접수 후 공통 안내 — 두 상태 모두 다음에 일어날 일이 같다(관리자가 확인 → 활성화). */
export const REACTIVATION_SENT_DESC = "관리자가 확인하면 다시 활동할 수 있어요.";

/** 사유가 없을 때의 기본 문구 — 서버 방어선이 던지던 기존 메시지 그대로. */
export const INACTIVE_ACTION_MESSAGE = "비활성화된 회원입니다. 관리자에게 문의하세요.";

/**
 * 탈퇴 기본 문구. 비활성 것을 빌려 쓰지 않는다 — **할 일이 다르다.** 비활성은 문의하면
 * 풀리지만 탈퇴는 재가입을 요청해야 하고, 그 버튼이 앱 안에 있다는 걸 알려야 한다.
 */
export const LEFT_ACTION_MESSAGE = "탈퇴한 회원입니다. 앱에서 재가입을 요청해 주세요.";

/**
 * 서버가 쓰기를 막을 때 돌려주는 문구. 사유가 있으면 끼워 넣는다.
 *
 * 이 문구는 `withActive` 를 쓰는 액션 전부(기강이야기 응원·팻말·한마디·깅스타그램 포함)가
 * 공유하므로, 여기 사유를 넣으면 다이얼로그가 없는 자리까지 한 번에 이유를 말하게 된다.
 */
export function buildInactiveActionMessage(member: InactiveNoticeSource): string {
  const isLeft = member.status === "left";
  const base = isLeft ? LEFT_ACTION_MESSAGE : INACTIVE_ACTION_MESSAGE;
  const reason = getVisibleInactiveReason(member);
  if (!reason) return base;
  return isLeft
    ? `탈퇴한 회원입니다. (사유: ${reason}) 앱에서 재가입을 요청해 주세요.`
    : `비활성화된 회원입니다. (사유: ${reason}) 관리자에게 문의하세요.`;
}

/**
 * 회비 화면에서 미납자를 탈퇴 처리할 때 자동으로 적히는 사유.
 *
 * **본인이 읽는 문장이다** — 이제 탈퇴 사유가 차단 화면에 그대로 뜨므로, `관리자 탈퇴 처리`
 * 같은 내부 말투를 남기면 통보가 아니라 업무 메모를 읽히는 꼴이 된다. 문구를 호출부
 * (`ledger-client`)에 리터럴로 두지 않는 이유도 같다 — 거기서 고치면 이 파일의 노출 규칙과
 * 따로 놀고, 사람이 읽을 문장인지 아무도 다시 보지 않는다.
 *
 * "그래서 어떻게 하면 되는가"는 여기 적지 않는다 — 차단 화면의 `재가입 요청하기` 버튼이
 * 바로 아래 서 있어서, 사유 문장까지 안내를 겹치면 같은 말이 두 번 나온다.
 *
 * @param unpaidAmount 미납액(원, 양수)
 */
export function buildDuesLeaveReason(unpaidAmount: number): string {
  return `회비 ${unpaidAmount.toLocaleString()}원 미납으로 탈퇴 처리되었어요`;
}
