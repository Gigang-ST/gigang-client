"use server";

import { dayjs } from "@/lib/dayjs";
import { withActive, withMember } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import {
  personalScheduleSchema,
  updatePersonalScheduleSchema,
  type PersonalScheduleInput,
  type UpdatePersonalScheduleInput,
} from "@/lib/validations/personal-schedule";

// 개인 일정은 본인만 본다 — 알림·포인트·캐시 무효화가 하나도 없다(다른 사람 화면에 닿을 길이 없어서).
// 달력은 클라이언트가 직접 다시 읽는다(refreshMonthData).
//
// 쓰기는 **사용자 세션 클라이언트**로 한다. 본인 전용 RLS(mem_sch_mst_*_own)가 남의 행을 막는데,
// RLS에 막힌 UPDATE는 오류가 아니라 0행 no-op이라 조용히 "성공"한다 — 그래서 수정·삭제는
// 영향받은 행을 돌려받아 0이면 실패로 던진다.

export async function createPersonalSchedule(input: PersonalScheduleInput) {
  // 작성은 active 회원만 — FAB 자체가 active 에게만 뜨고, 서버가 최종 방어.
  return withActive(async ({ member, supabase }) => {
    const { teamId } = await getRequestTeamContext();
    const parsed = personalScheduleSchema.parse(input);

    const { data, error } = await supabase
      .from("mem_sch_mst")
      .insert({
        team_id: teamId,
        mem_id: member.id,
        sch_nm: parsed.sch_nm,
        sch_dt: parsed.sch_dt,
        stt_tm: parsed.stt_tm || null,
        end_tm: parsed.end_tm || null,
        cont_txt: parsed.cont_txt || null,
      })
      .select("mem_sch_id")
      .single();

    if (error || !data) throw new Error("개인 일정 등록에 실패했습니다.");
    return { mem_sch_id: data.mem_sch_id };
  });
}

export async function updatePersonalSchedule(input: UpdatePersonalScheduleInput) {
  // 수정·삭제는 비활성 회원에게도 연다 — 자기 달력에 남은 일정을 못 지우면 영영 이고 다닌다.
  return withMember(async ({ member, supabase }) => {
    const { mem_sch_id, ...fields } = updatePersonalScheduleSchema.parse(input);

    const { data, error } = await supabase
      .from("mem_sch_mst")
      .update({
        sch_nm: fields.sch_nm,
        sch_dt: fields.sch_dt,
        stt_tm: fields.stt_tm || null,
        end_tm: fields.end_tm || null,
        cont_txt: fields.cont_txt || null,
        upd_at: dayjs().toISOString(),
      })
      .eq("mem_sch_id", mem_sch_id)
      .eq("mem_id", member.id)
      .eq("del_yn", false)
      .select("mem_sch_id");

    if (error) throw new Error("개인 일정 수정에 실패했습니다.");
    if (!data?.length) throw new Error("일정을 찾을 수 없습니다.");
  });
}

export async function deletePersonalSchedule(mem_sch_id: string) {
  return withMember(async ({ member, supabase }) => {
    const { data, error } = await supabase
      .from("mem_sch_mst")
      .update({ del_yn: true, upd_at: dayjs().toISOString() })
      .eq("mem_sch_id", mem_sch_id)
      .eq("mem_id", member.id)
      .eq("del_yn", false)
      .select("mem_sch_id");

    if (error) throw new Error("개인 일정 삭제에 실패했습니다.");
    if (!data?.length) throw new Error("일정을 찾을 수 없습니다.");
  });
}
