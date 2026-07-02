"use server";

import { revalidatePath } from "next/cache";

import { withMember } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { isPastEventKst } from "@/lib/past-event";
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
    // 모임 검증용 조회와 내 참석 여부 조회는 독립적 — 병렬 1 RTT로 (직렬 2 RTT 방지)
    const admin = createUntypedAdminClient();
    const [{ data: gthr }, { data: existing }] = await Promise.all([
      admin
        .from("gthr_mst")
        .select("max_prt_cnt, stt_at, end_at")
        .eq("gthr_id", gthr_id)
        .eq("del_yn", false)
        .single(),
      supabase
        .from("gthr_attd_rel")
        .select("attd_id")
        .eq("gthr_id", gthr_id)
        .eq("mem_id", member.id)
        .maybeSingle(),
    ]);

    if (!gthr) throw new Error("모임을 찾을 수 없습니다.");

    // 지난 모임(KST 날짜 기준)은 참석/참석해제 불가 — 관리자만 예외
    if (!member.admin && isPastEventKst(gthr.stt_at, gthr.end_at)) {
      throw new Error("지난 모임은 참석 변경이 불가합니다.");
    }

    if (existing) {
      const { error: deleteError } = await supabase.from("gthr_attd_rel").delete().eq("attd_id", existing.attd_id);
      if (deleteError) throw new Error("참석 취소에 실패했습니다.");
      // 홈(/)은 dynamic 렌더(getCurrentMember가 cookies 사용)라 매 요청 새로 조회되므로
      // revalidatePath("/")는 무효화할 캐시가 없어 불필요 — 모임 상세 직접 URL만 무효화한다.
      revalidatePath(`/gatherings/${gthr_id}`);
      return { attending: false };
    }

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

    // 홈(/)은 dynamic이라 revalidate 불필요(위 취소 경로 주석 참고). 모임 상세 직접 URL만 무효화.
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
