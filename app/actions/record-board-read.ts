"use server";

import { getCurrentMember } from "@/lib/queries/member";
import { recordBoardPostRead } from "@/lib/queries/board";

/** 클라이언트에서 호출 — 상세 페이지 진입 시 읽음 처리 */
export async function recordBoardReadAction(postId: string) {
  const { member } = await getCurrentMember();
  if (!member) return;
  await recordBoardPostRead(postId, member.id);
}
