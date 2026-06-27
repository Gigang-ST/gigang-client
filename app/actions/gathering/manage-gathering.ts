"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { dayjs } from "@/lib/dayjs";
import { withMember } from "@/lib/actions/auth";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { createGthrSchema, updateGthrSchema } from "@/lib/validations/gathering";

function toUtcIso(localDt: string | null | undefined): string | null {
  if (!localDt) return null;
  return dayjs.tz(localDt, "Asia/Seoul").toISOString();
}

export async function createGathering(input: {
  gthr_nm: string;
  gthr_type_enm: string;
  sprt_cd?: string | null;
  stt_at: string;
  end_at?: string | null;
  loc_txt?: string | null;
  desc_txt?: string | null;
  max_prt_cnt?: number | null;
}) {
  return withMember(async ({ member, supabase }) => {
    const { teamId } = await getRequestTeamContext();
    const parsed = createGthrSchema.parse({ ...input, team_id: teamId });

    const { data, error } = await supabase
      .from("gthr_mst")
      .insert({
        team_id: parsed.team_id,
        gthr_nm: parsed.gthr_nm,
        gthr_type_enm: parsed.gthr_type_enm,
        sprt_cd: parsed.sprt_cd ?? null,
        stt_at: toUtcIso(parsed.stt_at)!,
        end_at: toUtcIso(parsed.end_at),
        loc_txt: parsed.loc_txt ?? null,
        desc_txt: parsed.desc_txt ?? null,
        max_prt_cnt: parsed.max_prt_cnt ?? null,
        crt_by: member.id,
        del_yn: false,
      })
      .select("gthr_id")
      .single();

    if (error || !data) throw new Error("모임 개설에 실패했습니다.");

    const gthrId = data.gthr_id;

    // 작성자 자동 참석 등록
    const { error: attdError } = await supabase.from("gthr_attd_rel").insert({ gthr_id: gthrId, mem_id: member.id });
    if (attdError) throw new Error("자동 참석 등록에 실패했습니다.");
    const authorId = member.id;
    const gthrNm = parsed.gthr_nm;
    const gthrType = parsed.gthr_type_enm;
    const notiTypeMap: Record<string, string> = {
      general: "gthr_new", regular: "gthr_new", event: "gthr_new",
    };

    after(async () => {
      try {
        const admin = createUntypedAdminClient();

        const { data: members } = await admin
          .from("team_mem_rel")
          .select("mem_id")
          .eq("team_id", teamId)
          .eq("vers", 0)
          .eq("del_yn", false)
          .neq("mem_id", authorId);

        if (!members?.length) return;

        const notiType = notiTypeMap[gthrType] ?? "gthr_new";
        const dateStr = dayjs(toUtcIso(parsed.stt_at)!).tz("Asia/Seoul").format("M월 D일");

        // 인앱+푸시 한 몸. pref 수신거부 필터는 관문(insertNotiMany)이 처리.
        await insertNotiMany({
          teamId,
          memIds: members.map((m) => m.mem_id),
          notiTypeEnm: notiType,
          notiNm: `${dateStr} 새 모임이 등록됐습니다.`,
          notiCont: gthrNm,
          refId: gthrId,
          refTypeEnm: "gathering",
        });
      } catch (e) {
        console.error("[gthr_new] 알림 발송 실패", e);
      }
    });

    revalidatePath("/");
    return { gthr_id: gthrId };
  });
}

export async function updateGathering(input: {
  gthr_id: string;
  gthr_nm?: string;
  gthr_type_enm?: string;
  stt_at?: string;
  end_at?: string | null;
  loc_txt?: string | null;
  desc_txt?: string | null;
  max_prt_cnt?: number | null;
}) {
  return withMember(async ({ member, supabase }) => {
    const parsed = updateGthrSchema.parse(input);
    const { gthr_id, stt_at, end_at, ...rest } = parsed;

    const { error } = await supabase
      .from("gthr_mst")
      .update({
        ...rest,
        ...(stt_at !== undefined && { stt_at: toUtcIso(stt_at)! }),
        ...(end_at !== undefined && { end_at: toUtcIso(end_at) }),
        upd_at: dayjs().toISOString(),
      })
      .eq("gthr_id", gthr_id);

    if (error) throw new Error("모임 수정에 실패했습니다.");

    const { teamId } = await getRequestTeamContext();
    // gthr_nm이 생략됐을 때 빈 문자열로 알림이 발송되지 않도록 기존 모임명 조회
    let gthrNm = parsed.gthr_nm;
    if (!gthrNm) {
      const { data: existing } = await supabase.from("gthr_mst").select("gthr_nm").eq("gthr_id", gthr_id).single();
      gthrNm = existing?.gthr_nm ?? "";
    }

    after(async () => {
      try {
        const admin = createUntypedAdminClient();

        const { data: attendees } = await admin
          .from("gthr_attd_rel")
          .select("mem_id")
          .eq("gthr_id", gthr_id)
          .neq("mem_id", member.id);

        if (!attendees?.length) return;

        // 인앱+푸시 한 몸. pref 수신거부 필터는 관문(insertNotiMany)이 처리.
        await insertNotiMany({
          teamId,
          memIds: attendees.map((a) => a.mem_id),
          notiTypeEnm: "gthr_upd",
          notiNm: `'${gthrNm}' 모임 정보가 변경됐습니다.`,
          notiCont: gthrNm,
          refId: gthr_id,
          refTypeEnm: "gathering",
        });
      } catch (e) {
        console.error("[gthr_upd] 알림 발송 실패", e);
      }
    });

    revalidatePath("/");
    revalidatePath(`/gatherings/${input.gthr_id}`);
  });
}

export async function deleteGathering(gthr_id: string) {
  return withMember(async ({ member, supabase }) => {
    const { data: gthr } = await supabase
      .from("gthr_mst")
      .select("crt_by, team_id, gthr_nm")
      .eq("gthr_id", gthr_id)
      .single();
    if (!gthr) throw new Error("모임을 찾을 수 없습니다.");

    const isAuthor = gthr.crt_by === member.id;
    if (!isAuthor && !member.admin) throw new Error("삭제 권한이 없습니다.");

    const admin = createUntypedAdminClient();
    const { error } = await admin
      .from("gthr_mst")
      .update({ del_yn: true, upd_at: dayjs().toISOString() })
      .eq("gthr_id", gthr_id);

    if (error) throw new Error("모임 삭제에 실패했습니다.");

    after(async () => {
      try {
        const { data: attendees } = await admin
          .from("gthr_attd_rel")
          .select("mem_id")
          .eq("gthr_id", gthr_id)
          .neq("mem_id", member.id);

        if (!attendees?.length) return;

        // 인앱+푸시 한 몸. gthr_del은 gthr_upd와 동일한 설정 항목으로 수신거부를 판단(prefTypeEnm).
        await insertNotiMany({
          teamId: gthr.team_id,
          memIds: attendees.map((a) => a.mem_id),
          notiTypeEnm: "gthr_del",
          prefTypeEnm: "gthr_upd",
          notiNm: `'${gthr.gthr_nm}' 모임이 취소됐습니다.`,
          notiCont: gthr.gthr_nm,
          refId: gthr_id,
          refTypeEnm: "gathering",
        });
      } catch (e) {
        console.error("[gthr_del] 알림 발송 실패", e);
      }
    });

    revalidatePath("/");
  });
}
