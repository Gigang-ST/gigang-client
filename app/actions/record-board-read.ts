"use server";

import { getCurrentMember } from "@/lib/queries/member";
import { recordBoardPostRead } from "@/lib/queries/board";

/**
 * 게시글 읽음 이력을 기록한다.
 * 게시판 상세는 SSG라 서버 렌더에서 멤버를 조회할 수 없으므로 읽음 처리를 이 액션으로 뺐다.
 * 비로그인/미가입이면 조용히 no-op (게시판은 공개, 읽음 이력은 로그인 멤버만 의미가 있음).
 * 홈 화면의 미읽음 표시(hasUnreadBoardPosts)가 이 이력을 소비한다.
 */
export async function recordBoardReadAction(postId: string): Promise<void> {
  const { member } = await getCurrentMember();
  if (!member) return;

  await recordBoardPostRead(postId, member.id);
}
