"use server";

import { updateTag } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { uploadPostPhoto, removePostPhoto } from "@/lib/storage/post-photo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRecordFlexSchema } from "@/lib/validations/post";

export type CreateRecordFlexResult =
  | { ok: false; message: string }
  | { ok: true; post_id: string };

/**
 * 기강이야기 운동기록 작성 — 사진(필수) + 한마디(선택) + 날짜.
 *
 * 거리·종목은 받지 않는다. 이 지면은 수치가 아니라 친목·응원이 목적이라
 * 사진 한 장과 한마디면 충분하다(수치가 필요하면 마일리지런에서 올리고, 거기에 사진을
 * 붙이면 같은 지면에 함께 선다 — 자세한 경계는 `createRecordFlexSchema` 주석).
 *
 * **사진은 필수다.** 이 지면에 서는 유일한 조건이라 서버에서도 막는다 — 없으면 지면에
 * 프로필 사진으로 때운 빈 칸이 생기고, 그건 기록 격자가 아니라 얼굴 격자가 된다.
 *
 * 사진이 있어 `FormData`로 받는다(각오와 달리 JSON이 아니다). 업로드는 세션 클라이언트로
 * `post-photos` 버킷에, DB INSERT는 admin 클라이언트로 한다 — `createPledge`와 같은 경계다.
 *
 * 순서가 중요하다: **사진 업로드를 먼저, INSERT를 나중에** 한다. 반대로 하면 업로드가 실패했을 때
 * 사진 없는 행이 남는다(격자는 사진이 없으면 아예 안 세운다 — RPC가 거른다). 대신 INSERT가
 * 실패하면 올린 파일을 되돌려 지운다
 * (고아 파일을 남기지 않는다).
 *
 * `story-posts` 태그만 무효화한다 — `story-feed`까지 날리면 자랑 한 건이 피드 전체 캐시를
 * 끌고 내려간다(태그를 분리한 이유가 이것이다).
 */
export async function createRecordFlex(
  formData: FormData,
): Promise<CreateRecordFlexResult> {
  const parsed = createRecordFlexSchema.safeParse({
    cmnt_txt: String(formData.get("cmnt_txt") ?? ""),
    act_dt: String(formData.get("act_dt") ?? ""),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, message: "사진을 한 장 올려주세요." };
  }

  try {
    return await withActive(async ({ member, supabase }) => {
      const { teamId } = await getRequestTeamContext();

      const uploaded = await uploadPostPhoto(supabase, member.id, file);
      if (!uploaded.ok) return { ok: false as const, message: uploaded.message };

      const admin = createAdminClient();
      const { data, error } = await admin
        .from("post_mst")
        .insert({
          team_id: teamId,
          mem_id: member.id,
          post_type_enm: "record_flex",
          src_enm: "manual",
          photo_url: uploaded.url,
          // 빈 한마디는 null로 눕힌다 — 마일리지런 유입분(`NULLIF(btrim(review),'')`)과
          // 같은 모양이어야 "한마디 없음" 판정이 경로마다 갈리지 않는다
          cmnt_txt: parsed.data.cmnt_txt || null,
          act_dt: parsed.data.act_dt,
        })
        .select("post_id")
        .single();

      if (error || !data) {
        console.error("[createRecordFlex] 저장 실패", error);
        // 행이 안 생겼으면 방금 올린 사진은 아무도 참조하지 않는다 — 고아로 두지 않는다
        await removePostPhoto(supabase, uploaded.path);
        return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
      }

      // `revalidateTag(tag, "max")`가 아니라 `updateTag(tag)`다 — 프로필을 준 revalidateTag는
      // stale-while-revalidate라 Next가 일부러 액션이 자기 쓰기를 되읽지 못하게 막는다. 그러면
      // 올리자마자 router.refresh()가 낡은 캐시를 받아 "새로고침해야 기록이 보이는" 증상이 난다.
      // (같은 이유·같은 처방이 createPledge에도 적용돼 있다.)
      updateTag("story-posts");
      return { ok: true as const, post_id: data.post_id };
    });
  } catch (e) {
    // withActive는 비로그인·비활성이면 throw한다 — createPledge와 동일하게 결과값으로 변환
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
