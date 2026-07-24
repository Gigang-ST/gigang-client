"use server";

import { updateTag } from "next/cache";

import { dayjs } from "@/lib/dayjs";
import { withActive } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createPledgeSchema } from "@/lib/validations/pledge";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreatePledgeResult =
  | { ok: false; message: string }
  | { ok: true; pldg_id: string };

/**
 * 각오(한 줄 다짐) 작성 — **한 사람당 한 개.** 새로 쓰면 이전 각오는 지면에서 내려간다.
 * 로그인한 활동 멤버 누구나 작성 가능.
 *
 * 내리는 방식은 `del_yn = true` 소프트 삭제다 — **행을 지우지 않는다.** "이 사람이 지난달엔
 * 뭘 다짐했나"는 나중에 되살릴 수 있어야 하는 기록이고, 하드 삭제하면 그 이력이 영영 없어진다.
 *
 * `withActive`가 로그인 + `mem_st_cd = 'active'`를 강제한다(RLS의 `v2_rls_auth_in_team`은
 * 팀 소속만 검사하고 활동 여부는 안 본다 — `pldg_mst` RLS insert 정책과 동일 경계).
 *
 * 목록은 "최근순 무제한 누적"이라 페이지네이션 무효화 지점이 없다 — 작성 즉시 태그만 갱신하면
 * 전광판 pledges 존이 따라온다. `bumpStoryReaction`과 달리 여기는 연타가 없는 저빈도 쓰기라
 * 매 작성마다 무효화해도 캐시가 남아나지 않는다(응원과의 결정적 차이).
 *
 * 무효화는 `revalidateTag`가 아니라 **`updateTag`**다 — 이유는 아래 호출부 주석 참고.
 */
export async function createPledge(input: { pldg_txt: string }): Promise<CreatePledgeResult> {
  const parsed = createPledgeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "잘못된 요청입니다" };
  }

  try {
    return await withActive(async ({ member }) => {
      const { teamId } = await getRequestTeamContext();
      const admin = createAdminClient();

      const { data, error } = await admin
        .from("pldg_mst")
        .insert({
          team_id: teamId,
          mem_id: member.id,
          pldg_txt: parsed.data.pldg_txt,
        })
        .select("pldg_id")
        .single();

      if (error || !data) {
        console.error("[createPledge] 저장 실패", error);
        return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
      }

      // 새 각오가 자리 잡은 **뒤에** 이전 것들을 내린다. 순서가 반대면 INSERT가 실패했을 때
      // 이전 각오까지 사라져 이 사람의 하늘이 통째로 비어버린다(서버 액션엔 트랜잭션이 없다).
      // 실패해도 새 각오는 이미 떠 있으므로 치명적이지 않다 — 다음 작성 때 함께 정리된다.
      const { error: sweepError } = await admin
        .from("pldg_mst")
        .update({ del_yn: true, upd_at: dayjs().toISOString() })
        .eq("team_id", teamId)
        .eq("mem_id", member.id)
        .eq("del_yn", false)
        .neq("pldg_id", data.pldg_id);
      if (sweepError) {
        console.error("[createPledge] 이전 각오 내리기 실패", sweepError);
      }

      // 각오는 리드·떠다니는 아바타·팻말존 모두 story-feed(큰 RPC)의 `pledges`를 읽는다.
      // 전용 캐시(story-pledges)는 종이비행기가 각오를 실어 나르던 시절 float_at 편성을
      // 위한 것이었는데, 비행기가 한마디(msg_mst)로 옮겨가며 읽는 곳이 없어져 걷어냈다.
      //
      // **`revalidateTag(tag, "max")`가 아니라 `updateTag(tag)`다.** 프로필을 준 revalidateTag는
      // stale-while-revalidate라 Next가 일부러 "액션이 자기 쓰기를 되읽지 못하게" 한다
      // (`pathWasRevalidated`를 안 찍는다 — next/dist/.../revalidate.js). 그래서 저장 직후
      // router.refresh()가 **낡은 캐시**를 받아 "새로고침해야 보이는" 증상이 났다. updateTag는
      // 즉시 만료 + read-your-own-writes라 내 화면도, Realtime을 받은 남의 화면도 바로 갱신된다.
      updateTag("story-feed");
      return { ok: true as const, pldg_id: data.pldg_id };
    });
  } catch (e) {
    // withActive는 비로그인·비활성일 때 throw한다. bumpStoryReaction과 동일하게 결과값으로 변환.
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
