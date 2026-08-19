"use server";

import { env } from "@/lib/env";
import { getCurrentMember } from "@/lib/queries/member";

/**
 * 오픈채팅 비번 조회 결과.
 *
 * **`guest`와 `unavailable`을 반드시 갈라 돌려준다.** 예전엔 둘 다 `null`이었는데, 그러면
 * 화면이 설정 사고를 "당신은 회원이 아닙니다"로 번역한다 — 멀쩡한 멤버에게 `회원가입 /
 * 로그인하기` 버튼이 뜨고, 보는 사람은 로그인이 풀린 줄 안다. 실제로 로컬에서 이걸로 헤맸고,
 * 원인을 찾는 데 든 시간 대부분이 "원래 이랬나 내가 깬 건가"를 가리는 데 들어갔다.
 *
 * `KAKAO_CHAT_PASSWORD`는 `lib/env.ts`에서 optional이라 **없어도 앱이 뜬다**(로컬 `.env`에
 * 안 넣어둔 경우가 흔하다). 필수로 바꾸지 않는 이유는, 채널 안내 하나 때문에 앱 전체가
 * 부팅에 실패하는 게 더 나쁘기 때문이다. 대신 **조용히 비멤버로 떨어지지 않게** 한다.
 */
export type KakaoPasswordResult =
  | { status: "member"; password: string }
  | { status: "guest" }
  | { status: "unavailable" };

export async function getKakaoChatPassword(): Promise<KakaoPasswordResult> {
  const { member } = await getCurrentMember();
  if (!member) return { status: "guest" };

  const password = env.KAKAO_CHAT_PASSWORD;
  if (!password) {
    // 멤버 판정을 통과했는데 값이 없으면 사용자 상태가 아니라 **설정 사고**다.
    console.error(
      "[social] KAKAO_CHAT_PASSWORD 미설정 — 멤버에게 오픈채팅 비번을 못 보여준다. " +
        "로컬이면 .env에 값을 넣고 dev 서버를 재시작할 것(서버 환경변수라 핫리로드 안 됨).",
    );
    return { status: "unavailable" };
  }

  return { status: "member", password };
}
