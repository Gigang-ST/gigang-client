"use server";

import { updateTag } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { FLY_DIST_MAX } from "@/lib/story-throw";

export type SetFlyDistResult = { ok: boolean };

/**
 * 던진 거리 기록 — 한마디를 날린 뒤 슬링샷 연출이 끝나면 호출한다.
 *
 * **INSERT와 나눠 둔 이유**: 던지기는 전송 *뒤*에 오는 놀이라 INSERT 시점엔 거리를 모른다.
 * 붙여서 하나로 만들면 "던져야 저장되는" 구조가 되고, 그러면 던지다 그만둔 사람의 한마디가
 * 사라진다 — 놀이가 글쓰기를 막지 않게 하는 게 이 기능의 전제다.
 *
 * `createMessage`와 달리 **admin 클라이언트를 쓰지 않는다.** 소유권 판정(내 한마디인가)이
 * 핵심인 쓰기라 RLS와 같은 사용자 컨텍스트로 가야 한다. 실제 판정은 `set_message_fly_dist`
 * RPC가 하고(본인 + 아직 안 던진 것만), 여기서는 그 결과를 그대로 옮긴다.
 *
 * **실패해도 조용하다.** 거리는 놀이의 부산물이지 사용자가 입력한 값이 아니라서,
 * 못 남겼다고 토스트를 띄우면 방금 끝난 연출 위에 영문 모를 에러가 얹힌다. 한마디 자체는
 * 이미 하늘에 떠 있으므로 잃은 것도 없다.
 */
export async function setFlyDist(input: {
  msgId: string;
  dist: number;
}): Promise<SetFlyDistResult> {
  // 거리는 클라이언트가 계산한 값이라 신뢰하지 않는다. DB도 한 번 더 자르지만(RPC·CHECK),
  // 여기서 먼저 정수·범위로 좁혀 이상한 값이 네트워크를 타지 않게 한다.
  const dist = Math.round(Number(input.dist));
  if (!Number.isFinite(dist)) return { ok: false };
  const safeDist = Math.min(FLY_DIST_MAX, Math.max(0, dist));

  try {
    return await withActive(async ({ supabase }) => {
      const { data, error } = await supabase.rpc("set_message_fly_dist", {
        p_msg_id: input.msgId,
        p_dist: safeDist,
      });

      if (error) {
        console.error("[setFlyDist] 거리 기록 실패", error);
        return { ok: false };
      }

      // 하늘의 고도가 이 값으로 정해지므로, 기록됐을 때만 지면을 다시 그린다.
      // (false = 이미 던졌거나 남의 것 — 바뀐 게 없어 무효화할 이유가 없다.)
      if (data === true) updateTag("story-messages");

      return { ok: data === true };
    });
  } catch {
    // withActive가 비로그인·비활성일 때 throw한다. 여기선 조용히 실패로 접는다.
    return { ok: false };
  }
}
