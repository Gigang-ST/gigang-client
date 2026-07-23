"use server";

import { withActive } from "@/lib/actions/auth";
import { RCTN_CODES, type RctnCd, type StoryEntityType } from "@/lib/queries/story-feed";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { MAX_RCTN_DELTA } from "@/lib/story-reaction";
import { createAdminClient } from "@/lib/supabase/admin";

const ENTITY_TYPES: StoryEntityType[] = ["newbie", "record", "race"];

export type BumpResult =
  | { ok: false; message: string }
  | { ok: true; myCount: number };

/**
 * 전광판 응원 카운트업 — 누른 만큼 올라간다. 취소는 없다.
 *
 * 1인 1회 토글이던 것을 무한 카운트로 바꿨다. `rctn_mst`는 여전히 1인 1행이고
 * 행 안의 `rctn_cnt`가 오른다 — 누가 몇 번 눌렀는지가 남고 상한(99)이 CHECK로 걸린다.
 * 증가는 `bump_story_rctn` RPC 한 문장으로 처리한다(읽고-쓰기 왕복은 동시 연타에서 유실된다).
 *
 * **`revalidateTag`를 호출하지 않는다.** 여럿이 연타하면 `story-feed` 캐시가 계속 무효화된다.
 * 클라이언트가 낙관적으로 즉시 반영하고, 서버 값은 기존 5분 revalidate 주기에 수렴시킨다 —
 * 응원 숫자에 실시간 정확도는 요구되지 않는다.
 */
export async function bumpStoryReaction(input: {
  entityType: StoryEntityType;
  entityId: string;
  rctnCd: RctnCd;
  /** 디바운스 구간 동안 모인 탭 수 */
  delta: number;
}): Promise<BumpResult> {
  // 클라이언트 입력을 그대로 쿼리에 태우지 않는다 — 허용 목록으로 좁힌다.
  if (!ENTITY_TYPES.includes(input.entityType)) {
    return { ok: false, message: "알 수 없는 항목입니다" };
  }
  if (!RCTN_CODES.includes(input.rctnCd)) {
    return { ok: false, message: "알 수 없는 리액션입니다" };
  }
  if (
    !Number.isInteger(input.delta) ||
    input.delta < 1 ||
    input.delta > MAX_RCTN_DELTA
  ) {
    return { ok: false, message: "잘못된 요청입니다" };
  }

  try {
    return await withActive(async ({ member }) => {
      const { teamId } = await getRequestTeamContext();
      const db = createAdminClient();

      const { data, error } = await db.rpc("bump_story_rctn", {
        p_team_id: teamId,
        p_entity_type: input.entityType,
        p_entity_id: input.entityId,
        p_mem_id: member.id,
        p_rctn_cd: input.rctnCd,
        p_delta: input.delta,
      });

      if (error) {
        console.error("[bumpStoryReaction] 저장 실패", error);
        return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
      }

      return { ok: true as const, myCount: data ?? 0 };
    });
  } catch (e) {
    // withActive는 비로그인·비활성일 때 throw한다. 연타 중 예외가 터지면
    // 트랜지션 안에서 처리되지 않으므로 여기서 결과값으로 바꿔 돌려준다.
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
