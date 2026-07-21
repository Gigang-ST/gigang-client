"use server";

import { getCurrentMember } from "@/lib/queries/member";

export type BoardPermission = {
  /** 로그인 + 가입 완료 여부 */
  authed: boolean;
  /** 글 작성 권한 (관리자) */
  canWrite: boolean;
  /** 특정 글 수정/삭제 권한 (관리자 또는 작성자). writMemId 미전달 시 항상 false */
  canEdit: boolean;
};

/**
 * 게시판 권한을 클라이언트에서 조회한다.
 * 게시판은 SSG라 서버 렌더에서 멤버를 조회할 수 없으므로, 버튼 노출용 권한만 이 액션으로 뺀다.
 * (실제 쓰기/수정/삭제 인가는 create/update/delete-post 액션이 서버에서 다시 검증하므로,
 *  이 값은 UI 노출 판단용이며 보안 경계가 아니다.)
 *
 * @param writMemId 상세 페이지에서 canEdit(작성자 여부) 계산에 쓸 글 작성자 id. 목록에서는 생략.
 */
export async function checkBoardPermission(
  writMemId?: string | null,
): Promise<BoardPermission> {
  const { member } = await getCurrentMember();

  if (!member) {
    return { authed: false, canWrite: false, canEdit: false };
  }

  const canWrite = member.admin;
  const canEdit = Boolean(
    writMemId && (member.admin || member.id === writMemId),
  );

  return { authed: true, canWrite, canEdit };
}
