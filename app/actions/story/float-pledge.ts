"use server";

import { updateTag } from "next/cache";

import { dayjs } from "@/lib/dayjs";
import { withActive } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

export type FloatPledgeResult =
  | { ok: false; message: string }
  | { ok: true };

/**
 * 각오 띄우기 — 착륙장의 각오를 하늘로 올린다. `float_at = now()`로 갱신하면 하늘 정렬
 * (float_at 최신순) 맨 앞으로 와, 하늘이 꽉 차 있으면 가장 오래 떠 있던 것이 착륙장으로 밀린다.
 *
 * **누구든 아무 각오나 띄울 수 있다**(본인 것만이 아니다) — 하늘은 공유 편성이고, "읽고 싶은 걸
 * 내가 띄운다"가 이 기능의 전부다. 그래서 소유자 조건을 걸지 않는다. 다만 `createAdminClient`
 * (RLS 우회)를 쓰므로 **팀 스코프는 코드로 강제**한다: 넘어온 pldg_id가 이 요청의 팀 각오가
 * 아니면 갱신하지 않는다(IDOR 방지 — 남의 팀 각오를 못 건드리게).
 *
 * 무효화는 `story-pledges` 하나만 — 각오는 큰 피드에서 떼어 둔 슬라이스라, 연타돼도 여기만
 * 갱신되고 `story-feed`(10-CTE)는 건드리지 않는다. 열린 화면들의 즉시 반영은 클라이언트의
 * `pldg_mst` Realtime 구독이 맡는다.
 */
export async function floatPledge(input: { pldg_id: string }): Promise<FloatPledgeResult> {
  const pldgId = input?.pldg_id;
  if (!pldgId || typeof pldgId !== "string") {
    return { ok: false, message: "잘못된 요청입니다" };
  }

  try {
    return await withActive(async () => {
      const { teamId } = await getRequestTeamContext();
      const admin = createAdminClient();

      // team_id 조건을 UPDATE에 함께 걸어, 다른 팀 각오는 애초에 매칭되지 않게 한다.
      const { data, error } = await admin
        .from("pldg_mst")
        .update({ float_at: dayjs().toISOString() })
        .eq("pldg_id", pldgId)
        .eq("team_id", teamId)
        .eq("del_yn", false)
        .select("pldg_id")
        .maybeSingle();

      if (error) {
        console.error("[floatPledge] 갱신 실패", error);
        return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
      }
      if (!data) {
        // 매칭 0건 = 다른 팀 각오이거나 이미 내려간 각오. 조용히 무시(실패로 취급하지 않음).
        return { ok: false as const, message: "이미 내려간 각오예요" };
      }

      // `updateTag`(즉시 만료)여야 한다. `revalidateTag(tag, "max")`는 stale-while-revalidate라
      // Realtime을 받은 다른 화면의 router.refresh()가 **낡은 편성**을 받아, 띄운 사람 화면에만
      // (낙관적 UI 덕에) 반영되고 남에겐 안 보이는 반쪽 실시간이 된다.
      updateTag("story-pledges");
      return { ok: true as const };
    });
  } catch (e) {
    // withActive는 비로그인·비활성이면 throw — createPledge와 동일하게 결과값으로 변환
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
