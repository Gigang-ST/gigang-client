"use server";

import { revalidatePath } from "next/cache";

import { withMember } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

/**
 * 모임 참석 토글.
 * 참석 등록 시 `monthlyAttendCnt`(그 모임 stt_at 월 기준 본인 총참석 횟수)를 함께 반환해,
 * 클라이언트가 "이번 달 N회 참석" 토스트를 띄울 수 있게 한다. 취소 시엔 undefined.
 */
export async function toggleGatheringAttendance(
  gthr_id: string,
): Promise<{ attending: boolean; monthlyAttendCnt?: number }> {
  return withMember(async ({ member, supabase }) => {
    const { data: existing } = await supabase
      .from("gthr_attd_rel")
      .select("attd_id")
      .eq("gthr_id", gthr_id)
      .eq("mem_id", member.id)
      .maybeSingle();

    if (existing) {
      const { error: deleteError } = await supabase.from("gthr_attd_rel").delete().eq("attd_id", existing.attd_id);
      if (deleteError) throw new Error("참석 취소에 실패했습니다.");
      revalidatePath("/");
      revalidatePath(`/gatherings/${gthr_id}`);
      return { attending: false };
    }

    // 최대 인원 초과 여부 서버에서 검증 + 귀속월 산출용 stt_at 조회
    const admin = createUntypedAdminClient();
    const { data: gthr } = await admin
      .from("gthr_mst")
      .select("max_prt_cnt, stt_at")
      .eq("gthr_id", gthr_id)
      .eq("del_yn", false)
      .single();

    if (!gthr) throw new Error("모임을 찾을 수 없습니다.");

    if (gthr.max_prt_cnt !== null) {
      const { count } = await admin
        .from("gthr_attd_rel")
        .select("attd_id", { count: "exact", head: true })
        .eq("gthr_id", gthr_id);

      if ((count ?? 0) >= gthr.max_prt_cnt) throw new Error("인원이 마감됐습니다.");
    }

    // UNIQUE(gthr_id, mem_id) 제약이 있으므로 upsert로 중복 충돌 방지
    const { error } = await supabase
      .from("gthr_attd_rel")
      .upsert({ gthr_id, mem_id: member.id }, { onConflict: "gthr_id,mem_id", ignoreDuplicates: true });

    if (error) throw new Error("참석 등록에 실패했습니다.");

    revalidatePath("/");
    revalidatePath(`/gatherings/${gthr_id}`);

    // 이번 달(모임 귀속월) 본인 총참석 횟수 — 토스트 안내용(실패해도 참석 등록엔 영향 없음)
    let monthlyAttendCnt: number | undefined;
    try {
      const { teamId } = await getRequestTeamContext();
      const ym = dayjs(gthr.stt_at).tz("Asia/Seoul").format("YYYY-MM");
      const { data: stat } = await admin.rpc("get_member_monthly_activity", {
        p_team_id: teamId,
        p_mem_id: member.id,
        p_ym: ym,
      });
      monthlyAttendCnt = stat?.[0]?.attend_cnt ?? undefined;
    } catch {
      monthlyAttendCnt = undefined;
    }

    return { attending: true, monthlyAttendCnt };
  });
}
