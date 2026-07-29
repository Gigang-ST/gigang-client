"use server";

import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { withAdminOrThrow } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { BOARD_POSTS_CACHE_TAG } from "@/lib/queries/board";
import { insertNotiForTeam } from "@/lib/notifications/insert-noti";
import { createPostSchema } from "@/lib/validations/board";

export async function createPost(input: {
  post_type_enm: "notice" | "update";
  post_nm: string;
  post_cont: string;
  pin_yn: boolean;
}) {
  return withAdminOrThrow(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();

    const parsed = createPostSchema.parse({ ...input, team_id: teamId });

    const { data: post, error } = await admin
      .from("brd_post_mst")
      .insert({
        team_id: parsed.team_id, post_type_enm: parsed.post_type_enm,
        post_nm: parsed.post_nm, post_cont: parsed.post_cont,
        writ_mem_id: member.id, pin_yn: parsed.pin_yn,
      })
      .select("post_id")
      .single();

    if (error || !post) throw new Error("게시글 등록에 실패했습니다.");

    // 목록 캐시 무효화 (새 글이라 상세 태그는 아직 없음). DB 트리거도 동일 태그를 치지만
    // 앱에서 즉시 무효화해 작성 직후 목록에 바로 반영되도록 한다(트리거 웹훅은 비동기).
    revalidateTag(BOARD_POSTS_CACHE_TAG, "max");

    // 팀 전체에 알림 — 게시판 아이콘을 걷어내면서(햄버거=설정으로 통합) "새 공지/업데이트가
    // 있다"를 알릴 창구가 알림 벨 하나로 모인다. 그래서 작성 시점에 알림을 쏴야 한다.
    // `after()`로 응답 반환 뒤에 보낸다 — 서버리스는 응답 후 프로세스가 죽을 수 있어
    // await 안 한 프로미스가 끊긴다. 알림이 실패해도 게시글 등록은 이미 끝났고 되돌릴
    // 이유가 없다(insertNoti 계열은 내부에서 에러를 삼키고 로그만 남긴다 — 다른 발송처와 동일).
    after(() =>
      insertNotiForTeam({
        teamId: parsed.team_id,
        notiTypeEnm: parsed.post_type_enm === "notice" ? "brd_notice" : "brd_update",
        notiNm:
          parsed.post_type_enm === "notice"
            ? `[공지] ${parsed.post_nm}`
            : `[업데이트] ${parsed.post_nm}`,
        notiCont: null,
        refId: post.post_id,
        refTypeEnm: "board",
      }),
    );

    return { post_id: post.post_id };
  });
}
