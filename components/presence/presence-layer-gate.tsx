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
 * 조회에 실패해도 레이어는 세운다: 접속자 얼굴은 **없어도 되는 장식**이라 여기서 던지면
 * 얻는 것 없이 모든 페이지가 같이 죽는다.
 */
export async function PresenceLayerGate() {
  const [{ teamId }, { member }] = await Promise.all([
    getRequestTeamContext(),
    getCurrentMember(),
  ]);

  return (
    <PresenceLayer
      teamId={teamId}
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
