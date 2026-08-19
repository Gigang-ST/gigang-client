"use server";

import { withMember } from "@/lib/actions/auth";
import { getVisibleInactiveReason } from "@/lib/inactive-notice";

/**
 * 본인의 **비활성 사유** 조회 — `InactiveGateDialog`가 열릴 때 한 번 부른다.
 *
 * **왜 프롭이 아니라 액션인가**: 이 다이얼로그는 호출부가 열 곳이 넘고, 대회 등록·기록 저장
 * 쪽은 `kind`를 서버 페이지가 아니라 클라이언트 스토어에서 파생한다. 사유를 프롭으로 내리면
 * 서버 경로와 클라이언트 경로 두 벌로 조달해야 해서 한쪽만 빠뜨린 채 사유 없는 안내가 남는다.
 * 다이얼로그가 직접 물으면 조달 경로가 하나다. `getCurrentMember()`는 요청 내 캐시라
 * 이미 읽어 둔 `team_mem_rel` 을 재사용한다 — 쿼리가 늘지 않는다.
 *
 * 노출 판정(탈퇴 제외·공백 제외)은 `getVisibleInactiveReason` 한 곳이다 — 클라이언트가 넘기는
 * `kind`는 호출부에 따라 `left`를 구분 못 하기도 해서 게이트로 쓸 수 없다.
 *
 * 남의 사유를 볼 길은 없다 — 인자가 없고 본인 프로필만 읽는다.
 * `withActive` 가 아니라 `withMember` 인 이유는 requestReactivation 과 같다(비활성 회원이 쓴다).
 */
export async function getMyInactiveReason(): Promise<{ reason: string | null }> {
  return withMember(async ({ member }) => ({
    reason: getVisibleInactiveReason(member),
  }));
}
