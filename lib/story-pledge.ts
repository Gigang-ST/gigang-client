import type { StoryPledge } from "@/lib/queries/story-feed";

/**
 * 사람당 한 개로 좁힌다 — 각오는 **1인 1개**가 규칙이다(`createPledge`가 새 각오를 저장한 뒤
 * 그 사람의 이전 각오를 `del_yn`으로 내린다).
 *
 * 그 정리는 INSERT 성공 **후에** 도는 별도 UPDATE라, 실패하면 잠깐 두 건이 살아 있을 수 있다.
 * DB 유니크 제약으로 막지 않은 건 의도다 — 부분 유니크 인덱스를 걸면 "새 각오 INSERT"가
 * 먼저 터져서, 각오를 고쳐 쓰려던 사람이 아무것도 못 올리게 된다. 데이터 정합보다 화면 정합이
 * 싼 문제라 여기서 막는다. 목록은 최신순으로 오므로 앞선 것이 곧 최신이다.
 */
export function dedupePledgesByMember(pledges: StoryPledge[]): StoryPledge[] {
  const seen = new Set<string>();
  return pledges.filter((p) => {
    if (seen.has(p.mem_id)) return false;
    seen.add(p.mem_id);
    return true;
  });
}
