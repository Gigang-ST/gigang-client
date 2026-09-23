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
/**
 * 전역 접속자 레이어 잠정 중단 토글 — **삭제가 아니라 잠정 중단이다**(2026-09-24).
 *
 * **왜 껐나**: Realtime 클라이언트가 접속하면 Supabase가 `realtime.messages` 일자 파티션을
 * 정비하면서 `ALTER TABLE ... OWNER TO`를 **소유자가 이미 맞는데도 매번** 실행한다. 그게
 * `pgrst_ddl_watch` 이벤트 트리거를 울려 PostgREST가 **스키마 캐시를 전면 재적재**한다.
 * prd 실측 272 ALTER/일 → 재적재 약 170회/일이고, 2026-09-23 84분 장애가 이 경로였다
 * (`PGRST002` 336건이 한 시간에 몰림). 우리 코드 버그가 아니라 Supabase 쪽 버그이고
 * 수정이 진행 중이다 — supabase/postgres#2464.
 *
 * **왜 이 레이어가 방아쇠인가**: 파티션 정비는 **클라이언트 접속에 반응한다**(공식 문서 —
 * "the first time a client joins a channel for the project"). 이 레이어는 루트 레이아웃에
 * 붙어 **비로그인 포함 모든 방문자**가 채널을 열게 하므로 깨우는 횟수가 최대가 된다.
 * 실측 대조: prd 272회/일 vs dev 약 20회/일.
 *
 * **되살리기**: 이 상수만 `true`로. 아래 코드는 한 줄도 안 건드렸다.
 * 끄면 탭바 위 얼굴·공 튕기기가 사라지고, 전광판의 `지금 보는 중 N명`은 인원이 0이라
 * 스스로 안 그려진다(§components/story/presence-count.tsx). 되살릴 조건은 셋 중 하나다 —
 * ① supabase/postgres#2464 반영 ② PostgREST 16+ (재적재 비용 80%↓, #5100) ③ RAM 상향.
 */
const PRESENCE_ENABLED = false;

export async function PresenceLayerGate() {
  if (!PRESENCE_ENABLED) return null;

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
