"use server";

import { updateTag } from "next/cache";

import { withMember } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateRecordFlexSchema } from "@/lib/validations/post";

export type UpdateRecordFlexResult =
  | { ok: false; message: string }
  | { ok: true };

/**
 * 깅스타그램 한마디 수정 — 작성자 본인 또는 관리자.
 *
 * **사진과 날짜는 안 건드린다.** 사진은 지우고 다시 올리는 게 경로고(§updateRecordFlexSchema),
 * 날짜는 포인트 트리거(`trg_pt_post_mst`)가 회수·재적립을 도는 값이라 한마디 편집이
 * 적립 이력을 흔들면 안 된다. `cmnt_txt`만 바뀌면 그 트리거는 `act_dt`·`del_yn`이 그대로라
 * 아무 일도 하지 않는다.
 *
 * 권한 경계는 `deleteRecordFlex`와 같다: 관리자면 무엇이든, 아니면 자기 것만. 판정은
 * **서버에서 다시 한다** — 버튼을 감추는 건 안내일 뿐이고 post_id만 알면 액션은 직접 호출된다.
 * (`post_mst`의 UPDATE RLS는 `mem_id = 본인`이라 관리자는 그 정책을 못 탄다. 그래서 삭제와
 * 마찬가지로 admin 클라이언트로 우회하고 권한은 앱이 판정한다.)
 *
 * **출처(`src_enm`)에 따라 고치는 대상이 갈린다 — 삭제와 정확히 같은 이유다.**
 *
 * - `manual`(직접 올림): `post_mst.cmnt_txt`를 그대로 고친다.
 * - `mlg_auto`(마일리지런 유입): post를 직접 고치면 **되돌아간다** —
 *   `post_sync_from_mlg_act` 트리거가 `ON CONFLICT ... DO UPDATE SET cmnt_txt = EXCLUDED.cmnt_txt`라,
 *   원본 기록을 나중에 한 번이라도 수정하면 고친 한마디가 원본 `review` 값으로 덮인다.
 *   그래서 원본(`evt_mlg_act_hist.review`)을 고쳐 **트리거가 스스로 옮겨 적게** 한다.
 *   삭제가 원본 `photo_url`을 null로 만들어 트리거가 내리게 한 것과 같은 손놀림이다.
 *   이때 마일리지런 쪽 후기도 함께 바뀌는데, 애초에 **같은 한 문장**이므로 의도된 동작이다.
 */
export async function updateRecordFlex(
  input: unknown,
): Promise<UpdateRecordFlexResult> {
  const parsed = updateRecordFlexSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
    };
  }

  const { post_id: postId, cmnt_txt } = parsed.data;
  // 빈 한마디는 null로 눕힌다 — 작성 액션과 같은 모양(마일리지런 유입분의
  // `NULLIF(btrim(review),'')`과 맞춘다). ""로 남기면 "빈 문자열"과 "없음"이 갈린다.
  const nextText = cmnt_txt && cmnt_txt.length > 0 ? cmnt_txt : null;

  try {
    return await withMember(async ({ member }) => {
      const { teamId } = await getRequestTeamContext();
      const admin = createAdminClient();

      // 팀까지 함께 좁힌다 — post_id만으로 고치면 다른 팀 기록에 손이 닿는다.
      const { data: post } = await admin
        .from("post_mst")
        .select("post_id, mem_id, src_enm, ref_id")
        .eq("post_id", postId)
        .eq("team_id", teamId)
        .eq("del_yn", false)
        .maybeSingle();

      if (!post) return { ok: false as const, message: "이미 삭제된 기록이에요." };

      if (!member.admin && post.mem_id !== member.id) {
        return {
          ok: false as const,
          message: "본인이 올린 기록만 수정할 수 있어요.",
        };
      }

      if (post.src_enm === "mlg_auto") {
        // 유입분 — 원본 후기를 고치면 트리거가 post의 한마디를 따라 갱신한다(위 주석 참조).
        // ref_id가 비어 있으면 원본을 특정할 수 없다: post만 고쳐 봐야 되돌아가므로
        // 차라리 실패로 알린다(조용히 반쪽만 처리하는 것보다 낫다).
        if (!post.ref_id) {
          console.error("[updateRecordFlex] mlg_auto인데 ref_id 없음", postId);
          return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
        }

        const { error } = await admin
          .from("evt_mlg_act_hist")
          .update({ review: nextText, updated_at: dayjs().toISOString() })
          .eq("act_id", post.ref_id);

        if (error) {
          console.error("[updateRecordFlex] 마일리지런 후기 수정 실패", error);
          return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
        }
      } else {
        const { error } = await admin
          .from("post_mst")
          .update({ cmnt_txt: nextText, upd_at: dayjs().toISOString() })
          .eq("post_id", postId);

        if (error) {
          console.error("[updateRecordFlex] 수정 실패", error);
          return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
        }
      }

      // `story-posts`만 무효화한다(작성·삭제와 같은 이유 — `story-feed`까지 날리면 한 건이
      // 피드 전체 캐시를 끌고 내려간다). `revalidateTag`가 아니라 `updateTag`인 것도 같다:
      // 고친 직후 `router.refresh()`가 낡은 캐시를 받아 "새로고침해야 바뀌는" 증상을 막는다.
      updateTag("story-posts");
      return { ok: true as const };
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
