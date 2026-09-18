import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

import { PresenceLayer } from "@/components/presence/presence-layer";

/**
 * 전역 접속자 레이어의 **서버 쪽 관문** — 내 정체를 뽑아 클라이언트 레이어에 넘긴다.
 *
 * 루트 레이아웃에 `<Suspense fallback={null}>`으로 감싸 마운트한다. 설치 배너·
 * `PushPermissionPromptGate`와 **같은 자리, 같은 패턴**이다: `getCurrentMember()`가 쿠키를
 * 읽으므로 자기 Suspense 경계에 가둬야 페이지 본문 렌더를 안 막는다. 루트 레이아웃 자체는
 * async가 아니고 fetch도 없는데, 그 성질을 깨지 않으려고 관문을 따로 둔다.
 *
 * **비로그인도 레이어는 뜬다.** 그때 `me`는 null이고, 클라이언트가 세션 고정 익명 id
 * (`anon-xxxxxx`)로 track한다 — 유령 얼굴 + 익명 이름("새벽의 페이서")으로 보인다.
 *
 * **조회 실패를 격리한다.** 접속자 얼굴은 없어도 되는 장식인데, 이 컴포넌트는 **루트
 * 레이아웃**에 있어서 여기서 던지면 오류 경계가 페이지 본문까지 삼킨다 — Suspense는 대기를
 * 받아줄 뿐 오류를 막지 못한다. 장식 하나 때문에 모든 페이지가 같이 죽을 이유가 없으므로
 * `Promise.allSettled`로 둘을 따로 판정한다:
 *
 * - **팀 조회 실패** → 레이어를 세우지 않는다. 채널 이름이 `story-avatars:${teamId}`라
 *   팀을 모르면 어느 방에 들어갈지 정할 수 없다(틀린 방에 들어가면 남의 팀에 얼굴이 뜬다).
 * - **멤버 조회만 실패** → 레이어는 세우고 `me`만 null로 둔다. 로그인 사용자가 그 한 번의
 *   렌더에서 익명 얼굴로 보이지만, 레이어를 통째로 빼는 것보다 낫다(남들은 계속 보인다).
 */
export async function PresenceLayerGate() {
  const [team, me] = await Promise.allSettled([
    getRequestTeamContext(),
    getCurrentMember(),
  ]);

  if (team.status === "rejected") {
    console.error("[presence] 팀 조회 실패 — 레이어 생략", team.reason);
    return null;
  }
  if (me.status === "rejected") {
    // 삼키되 흔적은 남긴다 — 익명으로 보이는 원인을 나중에 추적할 수 있게.
    console.error("[presence] 멤버 조회 실패 — 익명으로 세움", me.reason);
  }

  const member = me.status === "fulfilled" ? me.value.member : null;

  return (
    <PresenceLayer
      teamId={team.value.teamId}
      me={
        member
          ? {
              id: member.id,
              name: member.full_name,
              avatarUrl: member.avatar_url,
            }
          : null
      }
    />
  );
}
