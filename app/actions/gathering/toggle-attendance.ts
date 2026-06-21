"use server";

import { revalidatePath } from "next/cache";

import { withMember } from "@/lib/actions/auth";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

export async function toggleGatheringAttendance(gthr_id: string): Promise<{ attending: boolean }> {
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

    // 최대 인원 초과 여부 서버에서 검증
    const admin = createUntypedAdminClient();
    const { data: gthr } = await admin
      .from("gthr_mst")
      .select("max_prt_cnt")
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
    return { attending: true };
  });
}
