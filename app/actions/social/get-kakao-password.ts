"use server";

import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { getTeamKakaoPassword } from "@/lib/team-social";

/**
 * 오픈채팅 비번 조회 결과.
 *
 * **`guest`와 `unavailable`을 반드시 갈라 돌려준다.** 예전엔 둘 다 `null`이었는데, 그러면
 * 화면이 설정 사고를 "당신은 회원이 아닙니다"로 번역한다 — 멀쩡한 멤버에게 `회원가입 /
 * 로그인하기` 버튼이 뜨고, 보는 사람은 로그인이 풀린 줄 안다. 실제로 로컬에서 이걸로 헤맸고,
 * 원인을 찾는 데 든 시간 대부분이 "원래 이랬나 내가 깬 건가"를 가리는 데 들어갔다.
 *
 * 비밀번호는 팀 설정(`social.kakao_open_chat_password`)에 있고 **없어도 앱이 뜬다**(넣기 전인 팀,
 * 로컬 dev 등). 필수로 막지 않는 이유는, 채널 안내 하나 때문에 화면이 실패하는 게 더 나쁘기 때문이다.
 * 대신 **조용히 비멤버로 떨어지지 않게** 한다.
 */
export type KakaoPasswordResult =
  | { status: "member"; password: string }
  | { status: "guest" }
  | { status: "unavailable" };

export async function getKakaoChatPassword(): Promise<KakaoPasswordResult> {
  // getCurrentMember 는 접속한 팀의 회원만 member 로 돌려준다 — 다른 팀 회원은 guest 다.
  const { member } = await getCurrentMember();
  if (!member) return { status: "guest" };

  const { teamId } = await getRequestTeamContext();
  const password = await getTeamKakaoPassword(teamId);
  if (!password) {
    // 멤버 판정을 통과했는데 값이 없으면 사용자 상태가 아니라 **설정 사고**다.
    console.error(
      "[social] 오픈채팅 비밀번호 미설정 — 멤버에게 비번을 못 보여준다. 팀 설정(team_cfg)의 " +
        "social.kakao_open_chat_password 를 넣을 것(기강은 전환 기간 동안 KAKAO_CHAT_PASSWORD 환경변수도 본다).",
      teamId,
    );
    return { status: "unavailable" };
  }

  return { status: "member", password };
}
