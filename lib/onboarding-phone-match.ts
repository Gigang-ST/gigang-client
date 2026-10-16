/**
 * 번호 조회 결과 → 온보딩 경로 판정.
 *
 * **이 판정이 계정의 주인을 정한다.** 결과의 `memId` 로 OAuth 가 `mem_mst` 에 연결되고
 * 소속이 꽂히므로, 한 명으로 좁혀지지 않으면 남의 계정에 붙을 수 있다. 그래서 2건 이상은
 * 진행하지 않고 멈춘다 — 같은 번호로 등록된 회원이 여럿인 건 관리자가 정리해야 하는
 * 데이터 오류지, 아무나 골라도 되는 상황이 아니다.
 *
 * 순수 함수로 떼어 둔 이유: 이 분기가 틀리면 **계정 탈취**가 되는데, DB 왕복에 섞여 있으면
 * 눈으로도 테스트로도 확인하기 어렵다. 조회는 호출부가 하고 판정은 여기서만 한다.
 */

export type PhoneMatch =
  /** 이 번호의 회원이 없다 — 신규 가입 */
  | { kind: "new" }
  /** 회원이 있고 현재 소속도 있다 — OAuth 만 연결 */
  | { kind: "active"; memId: string }
  /** 회원은 있는데 현재 소속이 없다 — 삭제된 회원의 재가입 */
  | { kind: "rejoin"; memId: string }
  /** 같은 번호의 회원이 여럿 — 사람이 정리해야 한다 */
  | { kind: "ambiguous" };

/**
 * @param memIds `mem_mst_mem_ids_by_norm_phone` 결과(빈 값·중복이 섞여 올 수 있다)
 * @param hasCurrentRel 그 회원에게 이 팀의 현재 소속(`vers=0`)이 있는가
 */
export function resolvePhoneMatch(
  memIds: (string | null | undefined)[],
  hasCurrentRel: boolean,
): PhoneMatch {
  const ids = [...new Set(memIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return { kind: "new" };
  if (ids.length > 1) return { kind: "ambiguous" };
  const memId = ids[0];
  return hasCurrentRel ? { kind: "active", memId } : { kind: "rejoin", memId };
}
