"use server";

import { getCurrentMember } from "@/lib/queries/member";

/**
 * 클라이언트에서 게시판 권한을 확인하는 서버 액션.
 * SSG 페이지에서 canWrite / canEdit / 읽음 처리에 사용.
 */
export async function checkBoardPermission(postWritMemId?: string | null) {
  const { member } = await getCurrentMember();
  if (!member) return { canWrite: false, canEdit: false, memberId: null as string | null };
  return {
    canWrite: member.admin,
    canEdit:
      member.admin ||
      (postWritMemId ? member.id === postWritMemId : false),
    memberId: member.id as string | null,
  };
}
