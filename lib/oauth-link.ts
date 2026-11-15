/**
 * 가입 화면의 "전화번호로 기존 회원에 로그인 연결" 판정.
 *
 * 이 길은 엑셀 시절 회원(로그인 없이 밀어 넣은 회원)이 처음 들어올 때 자기 기록을 이어받으라고 만든
 * 다리다. 전화번호 말고 본인 확인 수단이 없어서, **이미 로그인이 붙은 회원**에 이 길로 다른 로그인을
 * 붙이게 두면 번호만 아는 사람이 그 회원 계정을 가져간다(카카오로 가입한 회원의 번호로 구글 로그인을
 * 붙이는 식 — 멀티팀에선 기강 회원 전원이 울산 주소에서 이 화면에 올 수 있어 더 열렸다).
 *
 * 그래서:
 * - 지금 로그인이 이미 그 회원 것이면 → 바꿀 것 없음(울산에 같은 계정으로 들어온 기강 회원 등)
 * - 그 회원에 로그인이 하나도 없으면 → 연결(엑셀 회원의 첫 로그인 — 원래 목적)
 * - 다른 로그인이 이미 붙어 있으면 → 막는다. 다른 로그인을 더 붙이려면 **원래 계정으로 로그인한 뒤**
 *   더보기 → 계정 연동에서 붙인다(본인임이 로그인으로 확인된 상태).
 *
 * 순수 함수 — 회귀 테스트 `lib/__tests__/oauth-link.test.ts`.
 */

export type OauthProvider = "kakao" | "google";

export type OauthLinkDecision =
  | { kind: "already" }
  | { kind: "link"; column: "oauth_kakao_id" | "oauth_google_id" }
  | { kind: "blocked" };

export function decideOauthLink(
  member: { mem_id: string; oauth_kakao_id: string | null; oauth_google_id: string | null },
  authUserId: string,
  provider: OauthProvider,
): OauthLinkDecision {
  if (
    member.mem_id === authUserId ||
    member.oauth_kakao_id === authUserId ||
    member.oauth_google_id === authUserId
  ) {
    return { kind: "already" };
  }
  if (member.oauth_kakao_id || member.oauth_google_id) return { kind: "blocked" };
  return { kind: "link", column: provider === "kakao" ? "oauth_kakao_id" : "oauth_google_id" };
}

/** 막혔을 때 안내 — 어느 계정으로 가입했는지는 말하지 않는다(번호만 아는 사람에게 단서를 주지 않게) */
export const OAUTH_LINK_BLOCKED_MESSAGE =
  "이미 가입된 정보가 있어요. 처음 가입할 때 쓴 계정으로 로그인해 주세요. 다른 로그인도 쓰고 싶으면 로그인한 뒤 더보기 → 계정 연동에서 추가할 수 있어요.";
