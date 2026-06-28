"use server";

import { env } from "@/lib/env";
import { getCurrentMember } from "@/lib/queries/member";

/**
 * 카카오 오픈채팅 비밀번호 조회
 * 멤버인 경우 비밀번호 반환, 아닌 경우 null 반환
 */
export async function getKakaoChatPassword(): Promise<string | null> {
  const { member } = await getCurrentMember();
  if (!member) return null;
  return env.KAKAO_CHAT_PASSWORD ?? null;
}
