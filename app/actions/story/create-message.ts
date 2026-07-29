"use server";

import { updateTag } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createMessageSchema } from "@/lib/validations/message";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreateMessageResult =
  | { ok: false; message: string }
  | { ok: true; msg_id: string };

/**
 * 종이비행기 한마디 작성 — 24시간 뒤 하늘에서 내려가는 한 줄.
 * 로그인한 활동 멤버 누구나 작성 가능.
 *
 * **각오와 달리 1인 여러 개다.** 그래서 `createPledge`가 하는 "이전 것 내리기"(del_yn 스윕)를
 * 하지 않는다 — 24시간이면 알아서 빠지니 사람 손으로 정리할 이유가 없고, 하루에 여러 번
 * 올리는 게 이 존의 결이다(인스타 스토리처럼).
 *
 * `withActive`가 로그인 + `mem_st_cd = 'active'`를 강제한다(RLS의 `v2_rls_auth_in_team`은
 * 팀 소속만 검사하고 활동 여부는 안 본다 — `msg_mst` RLS insert 정책과 동일 경계).
 *
 * 무효화는 `revalidateTag`가 아니라 **`updateTag`**다. 프로필을 준 revalidateTag는
 * stale-while-revalidate라 Next가 일부러 "액션이 자기 쓰기를 되읽지 못하게" 한다 — 저장 직후
 * router.refresh()가 낡은 캐시를 받아 "새로고침해야 보이는" 증상이 난다(각오에서 겪은 그대로).
 * 무효화 태그는 `story-messages` 하나뿐이다 — 한마디는 큰 피드(`story-feed`)에 실리지 않는다.
 */
export async function createMessage(input: { msg_txt: string }): Promise<CreateMessageResult> {
  const parsed = createMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "잘못된 요청입니다" };
  }

  try {
    return await withActive(async ({ member }) => {
      const { teamId } = await getRequestTeamContext();
      const admin = createAdminClient();

      const { data, error } = await admin
        .from("msg_mst")
        .insert({
          team_id: teamId,
          mem_id: member.id,
          msg_txt: parsed.data.msg_txt,
        })
        .select("msg_id")
        .single();

      if (error || !data) {
        console.error("[createMessage] 저장 실패", error);
        return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
      }

      updateTag("story-messages");
      return { ok: true as const, msg_id: data.msg_id };
    });
  } catch (e) {
    // withActive는 비로그인·비활성일 때 throw한다. createPledge와 동일하게 결과값으로 변환.
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
