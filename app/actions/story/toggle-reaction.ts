"use server";

import { revalidateTag } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { RCTN_CODES, type RctnCd, type StoryEntityType } from "@/lib/queries/story-feed";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

const ENTITY_TYPES: StoryEntityType[] = ["newbie", "record", "race"];

/**
 * 전광판 리액션 토글 — 같은 코드를 다시 누르면 취소, 다른 코드면 교체.
 *
 * `rctn_mst`는 `(team_id, entity_type, entity_id, mem_id)` 유니크라 1인 1리액션이 보장된다.
 * 리액션은 기강 포인트 적립 대상이 아니므로 트리거를 붙이지 않는다(설계서 §4.1).
 */
export async function toggleStoryReaction(input: {
  entityType: StoryEntityType;
  entityId: string;
  rctnCd: RctnCd;
}) {
  // 클라이언트 입력을 그대로 쿼리에 태우지 않는다 — 허용 목록으로 좁힌다.
  if (!ENTITY_TYPES.includes(input.entityType)) {
    return { ok: false, message: "알 수 없는 항목입니다" };
  }
  if (!RCTN_CODES.includes(input.rctnCd)) {
    return { ok: false, message: "알 수 없는 리액션입니다" };
  }

  return withActive(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: existing, error: selectError } = await db
      .from("rctn_mst")
      .select("rctn_id, rctn_cd")
      .eq("team_id", teamId)
      .eq("entity_type", input.entityType)
      .eq("entity_id", input.entityId)
      .eq("mem_id", member.id)
      .maybeSingle();

    if (selectError) {
      console.error("[toggleStoryReaction] 조회 실패", selectError);
      return { ok: false, message: "잠시 후 다시 시도해 주세요" };
    }

    // 같은 리액션을 다시 누른 것 = 취소
    if (existing?.rctn_cd === input.rctnCd) {
      const { error } = await db.from("rctn_mst").delete().eq("rctn_id", existing.rctn_id);
      if (error) {
        console.error("[toggleStoryReaction] 삭제 실패", error);
        return { ok: false, message: "잠시 후 다시 시도해 주세요" };
      }
      revalidateTag("story-feed", "max");
      return { ok: true, message: null };
    }

    const { error } = await db.from("rctn_mst").upsert(
      {
        team_id: teamId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        mem_id: member.id,
        rctn_cd: input.rctnCd,
      },
      { onConflict: "team_id,entity_type,entity_id,mem_id" },
    );

    if (error) {
      console.error("[toggleStoryReaction] 저장 실패", error);
      return { ok: false, message: "잠시 후 다시 시도해 주세요" };
    }

    revalidateTag("story-feed", "max");
    return { ok: true, message: null };
  });
}
