"use server";

import { withActive } from "@/lib/actions/auth";
import {
  getStoryFeed,
  RCTN_CODES,
  type RctnCd,
  type StoryEntityType,
} from "@/lib/queries/story-feed";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { MAX_RCTN_DELTA } from "@/lib/story-reaction";
import { createAdminClient } from "@/lib/supabase/admin";

const ENTITY_TYPES: StoryEntityType[] = ["newbie", "record", "race"];

/**
 * 응원 대상이 **지금 이 팀 전광판에 실제로 올라온 항목**인지 확인한다.
 *
 * `createAdminClient()`는 RLS를 우회하고 `rctn_mst.entity_id`는 `text`라, 검증 없이 넘기면
 * 존재하지도 않는 id(심지어 임의 길이 문자열)로 행이 꽂힌다. 팀 소속 확인도 안 된다.
 *
 * 대상 테이블을 종류별로 다시 조회하지 않고 **캐시된 피드**(`getStoryFeed`, 5분)를 기준으로 삼는다.
 * 왕복이 늘지 않고, "전광판에 보이는 것만 응원할 수 있다"는 제품 규칙과도 정확히 일치한다.
 */
async function isOnBoard(
  teamId: string,
  entityType: StoryEntityType,
  entityId: string,
): Promise<boolean> {
  const feed = await getStoryFeed(teamId);
  const items =
    entityType === "newbie"
      ? feed.newbies
      : entityType === "record"
        ? feed.records
        : feed.races;
  return items.some((item) => item.entity_id === entityId);
}

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

      // 팀·존재 확인은 저장 직전에. 통과 못 하면 RPC까지 가지 않는다.
      if (!(await isOnBoard(teamId, input.entityType, input.entityId))) {
        return { ok: false as const, message: "이미 전광판에서 내려간 소식입니다" };
      }

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
