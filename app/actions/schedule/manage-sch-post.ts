"use server";

import { after } from "next/server";

import { dayjs } from "@/lib/dayjs";
import { withActive, withMember } from "@/lib/actions/auth";
import { isPastLockedFor, PAST_EVENT_ERROR } from "@/lib/past-event";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { insertSchPost, notifySchPostCreated } from "@/lib/sch-post";
import { createAdminClient, createUntypedAdminClient } from "@/lib/supabase/admin";
import { createSchPostSchema, updateSchPostSchema } from "@/lib/validations/schedule";

function toUtcIso(localDt: string | null | undefined): string | null {
  if (!localDt) return null;
  return dayjs.tz(localDt, "Asia/Seoul").toISOString();
}

export async function createSchPost(input: {
  sch_nm: string;
  post_type?: string;
  evt_stt_at: string;
  evt_end_at?: string | null;
  url?: string | null;
  cont_txt?: string | null;
}) {
  // 소식 작성은 active 회원만 — 비활성/탈퇴는 클라이언트 게이트가 안내, 서버가 최종 방어.
  return withActive(async ({ member, supabase }) => {
    const { teamId } = await getRequestTeamContext();
    const parsed = createSchPostSchema.parse({ ...input, team_id: teamId });

    // 저장·알림은 운영 MCP(`create_sch_post`, #630)와 같은 코어를 쓴다(lib/sch-post.ts).
    const created = await insertSchPost(supabase, {
      teamId: parsed.team_id,
      memId: member.id,
      values: parsed,
      sttIso: toUtcIso(parsed.evt_stt_at)!,
      endIso: toUtcIso(parsed.evt_end_at),
    });

    if (!created) throw new Error("일정 등록에 실패했습니다.");

    const postId = created.sch_post_id;
    const authorId = member.id;
    const postName = parsed.sch_nm;

    after(async () => {
      try {
        // 인앱+푸시 한 몸. pref 수신거부 필터는 관문(insertNotiMany)이 처리.
        await notifySchPostCreated(createAdminClient(), {
          teamId,
          authorId,
          postId,
          postName,
        });
      } catch (e) {
        console.error("[sch_post_new] 알림 발송 실패", e);
      }
    });

    return { sch_post_id: postId };
  });
}

export async function updateSchPost(input: {
  sch_post_id: string;
  sch_nm?: string;
  post_type?: string;
  evt_stt_at?: string;
  evt_end_at?: string | null;
  url?: string | null;
  cont_txt?: string | null;
}) {
  return withMember(async ({ member, supabase }) => {
    const parsed = updateSchPostSchema.parse(input);
    const { sch_post_id, ...fields } = parsed;

    // 지난 일정(KST 날짜 기준) 수정 차단 — 관리자만 예외
    const { data: existing } = await supabase
      .from("sch_post_mst")
      .select("evt_stt_at, evt_end_at, crt_by")
      .eq("sch_post_id", sch_post_id)
      .single();
    if (!existing) throw new Error("일정을 찾을 수 없습니다.");

    // 작성자/관리자만 수정 가능 — RLS에만 의존하면 무권한 update가 0행 no-op으로
    // 조용히 "성공" 처리되므로 코드에서 명시적으로 차단한다.
    if (existing.crt_by !== member.id && !member.admin) {
      throw new Error("수정 권한이 없습니다.");
    }
    if (isPastLockedFor(member.admin, existing.evt_stt_at, existing.evt_end_at)) {
      throw new Error(PAST_EVENT_ERROR);
    }

    const { error } = await supabase
      .from("sch_post_mst")
      .update({
        ...fields,
        evt_stt_at: fields.evt_stt_at ? toUtcIso(fields.evt_stt_at)! : undefined,
        evt_end_at: fields.evt_end_at !== undefined ? toUtcIso(fields.evt_end_at) : undefined,
        url: fields.url || null,
        upd_at: dayjs().toISOString(),
      })
      .eq("sch_post_id", sch_post_id);

    if (error) throw new Error("수정 권한이 없거나 일정 수정에 실패했습니다.");

  });
}

export async function deleteSchPost(sch_post_id: string) {
  return withMember(async ({ member, supabase }) => {
    const { data: post } = await supabase
      .from("sch_post_mst")
      .select("crt_by, team_id, evt_stt_at, evt_end_at")
      .eq("sch_post_id", sch_post_id)
      .single();
    if (!post) throw new Error("일정을 찾을 수 없습니다.");

    const isAuthor = post.crt_by === member.id;
    if (!isAuthor && !member.admin) throw new Error("삭제 권한이 없습니다.");

    // 지난 일정(KST 날짜 기준) 삭제 차단 — 관리자만 예외
    if (isPastLockedFor(member.admin, post.evt_stt_at, post.evt_end_at)) {
      throw new Error(PAST_EVENT_ERROR);
    }

    const admin = createUntypedAdminClient();
    const { error } = await admin
      .from("sch_post_mst")
      .update({ del_yn: true, upd_at: dayjs().toISOString() })
      .eq("sch_post_id", sch_post_id);
    if (error) throw new Error("일정 삭제에 실패했습니다.");

  });
}
