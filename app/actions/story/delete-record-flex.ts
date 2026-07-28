"use server";

import { updateTag } from "next/cache";

import { withMember } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { postPhotoPathFromUrl, removePostPhoto } from "@/lib/storage/post-photo";
import { createAdminClient } from "@/lib/supabase/admin";

export type DeleteRecordFlexResult =
  | { ok: false; message: string }
  | { ok: true };

/**
 * 기강이야기 운동기록 삭제 — 작성자 본인 또는 관리자.
 *
 * 권한 경계는 `deleteComment`와 같다: 관리자면 무엇이든, 아니면 자기 것만. 판정은 **서버에서
 * 다시 한다** — 클라이언트가 버튼을 감추는 건 안내일 뿐이고, post_id만 알면 액션은 직접
 * 호출된다.
 *
 * **출처(`src_enm`)에 따라 지우는 방식이 갈린다.**
 *
 * - `manual`(기강이야기에서 직접 올림): `post_mst.del_yn = true` + Storage 파일 제거.
 * - `mlg_auto`(마일리지런에서 유입): post를 직접 지우면 **되살아난다** —
 *   `post_sync_from_mlg_act` 트리거가 `ON CONFLICT ... DO UPDATE SET del_yn = false`라,
 *   원본 기록을 나중에 한 번이라도 수정하면 지운 게 다시 지면에 올라온다. 그래서 원본
 *   (`evt_mlg_act_hist.photo_url`)을 null로 만들어 **트리거가 스스로 내리게** 한다
 *   (사진이 없으면 `del_yn = true`로 내리는 분기가 이미 있다). 사진이 이 지면에 서는
 *   유일한 조건이라(§DESIGN 운동기록), 사진을 뗀다는 건 곧 "전광판에서 내린다"와 같다.
 *   마일리지런 기록의 수치·후기는 그대로 남는다 — 사라지는 건 사진뿐이다.
 *
 * 순서는 **DB 먼저, 파일 나중**이다. 반대로 하면 파일만 지워지고 행이 남았을 때 깨진
 * 이미지를 가리키는 기록이 지면에 선다(그 편이 더 나쁘다). 파일 제거가 실패해도 사용자
 * 흐름은 끊지 않는다 — `removePostPhoto`가 throw하지 않고 로그만 남긴다.
 *
 * `story-posts` 태그만 무효화한다(작성과 같은 이유 — `story-feed`까지 날리면 한 건이 피드
 * 전체 캐시를 끌고 내려간다). `revalidateTag`가 아니라 `updateTag`인 것도 같다: 지운 직후
 * `router.refresh()`가 낡은 캐시를 받아 "새로고침해야 사라지는" 증상을 막는다.
 */
export async function deleteRecordFlex(
  postId: string,
): Promise<DeleteRecordFlexResult> {
  if (!postId) return { ok: false, message: "잘못된 요청입니다." };

  try {
    return await withMember(async ({ member, supabase }) => {
      const { teamId } = await getRequestTeamContext();
      const admin = createAdminClient();

      // 팀까지 함께 좁힌다 — post_id만으로 지우면 다른 팀 기록에 손이 닿는다.
      const { data: post } = await admin
        .from("post_mst")
        .select("post_id, mem_id, src_enm, photo_url, ref_type_txt, ref_id")
        .eq("post_id", postId)
        .eq("team_id", teamId)
        .eq("del_yn", false)
        .maybeSingle();

      if (!post) return { ok: false as const, message: "이미 삭제된 기록이에요." };

      if (!member.admin && post.mem_id !== member.id) {
        return { ok: false as const, message: "본인이 올린 기록만 삭제할 수 있어요." };
      }

      const photoPath = postPhotoPathFromUrl(post.photo_url);

      if (post.src_enm === "mlg_auto") {
        // 유입분 — 원본에서 사진을 떼면 트리거가 post를 내린다(위 주석 참조).
        // ref_id가 비어 있으면 원본을 특정할 수 없다: 이때 post만 지우면 되살아나므로
        // 차라리 실패로 알린다(조용히 반쪽만 처리하는 것보다 낫다).
        if (!post.ref_id) {
          console.error("[deleteRecordFlex] mlg_auto인데 ref_id 없음", postId);
          return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
        }

        const { error } = await admin
          .from("evt_mlg_act_hist")
          .update({ photo_url: null })
          .eq("act_id", post.ref_id);

        if (error) {
          console.error("[deleteRecordFlex] 마일리지런 사진 제거 실패", error);
          return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
        }
      } else {
        const { error } = await admin
          .from("post_mst")
          .update({ del_yn: true, upd_at: dayjs().toISOString() })
          .eq("post_id", postId);

        if (error) {
          console.error("[deleteRecordFlex] 삭제 실패", error);
          return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
        }
      }

      // 행을 내린 뒤에 파일을 정리한다 — 아무도 참조하지 않게 된 다음이라 안전하다.
      if (photoPath) await removePostPhoto(supabase, photoPath);

      updateTag("story-posts");
      return { ok: true as const };
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
