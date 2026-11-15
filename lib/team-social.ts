import "server-only";

import { TEAM_ID_BY_CD } from "@/lib/constants/gigang-team";
import { env } from "@/lib/env";
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
 *
 * ⚠️ 전환용 분기: 기강은 `social.kakao_open_chat_password` 행을 넣기 전까지 예전 환경변수
 * (`KAKAO_CHAT_PASSWORD`)로 동작한다 — 비밀값이라 마이그레이션에 넣을 수 없어 사람이 손으로 넣어야 하고,
 * 그 사이 기강 화면에서 비밀번호가 사라지면 안 된다. **다른 팀에는 절대 환경변수를 쓰지 않는다.**
 * 행을 넣은 뒤 이 분기와 환경변수를 지운다(docs/migrations/multi-team-prd-rollout.md).
 */
export async function getTeamKakaoPassword(teamId: string): Promise<string | null> {
  const fromCfg = await getTeamCfg(teamId, "social.kakao_open_chat_password");
  if (fromCfg) return fromCfg;
  if (teamId === TEAM_ID_BY_CD.gigang) return env.KAKAO_CHAT_PASSWORD ?? null;
  return null;
}

/** 모임 계좌. 없으면 null — 화면은 계좌 안내를 그리지 않는다. */
export async function getTeamAccount(teamId: string): Promise<TeamAccount | null> {
  return getTeamCfg(teamId, "bank.team_account");
}
