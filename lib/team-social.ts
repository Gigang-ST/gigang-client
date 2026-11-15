import "server-only";

import type { TeamAccount, TeamChannels } from "@/lib/team-channels";
import { getTeamCfg } from "@/lib/team-cfg/read";

/**
 * 팀 채널·오픈채팅 비밀번호·모임 계좌 — 팀 설정(`team_cfg`)에서 읽는다.
 * 셋 다 **기본값이 없다**: 행이 없는 팀은 안 보인다(기강 값이 다른 팀 화면에 새지 않게).
 */

export async function getTeamChannels(teamId: string): Promise<TeamChannels> {
  return getTeamCfg(teamId, "social.channels");
}

/**
 * 오픈채팅 비밀번호. 회원 여부 판정은 호출부(서버 액션·서버 페이지)가 한다.
 * 팀 설정 행만 본다 — 예전 환경변수(`KAKAO_CHAT_PASSWORD`) 전환 분기는 기강 행을 넣은 뒤 걷었다(2026-11-15).
 * 비우면 정말로 안 보인다(팀 설정 화면 안내 「비우면 비밀번호 안내가 안 보여요」와 동작이 같다).
 */
export async function getTeamKakaoPassword(teamId: string): Promise<string | null> {
  return getTeamCfg(teamId, "social.kakao_open_chat_password");
}

/** 모임 계좌. 없으면 null — 화면은 계좌 안내를 그리지 않는다. */
export async function getTeamAccount(teamId: string): Promise<TeamAccount | null> {
  return getTeamCfg(teamId, "bank.team_account");
}
