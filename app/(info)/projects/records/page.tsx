import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonthKST, prevMonthStr } from "@/lib/dayjs";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { fetchActivityRecords } from "@/lib/queries/activity-records";
import { RecordsClient } from "./records-client";

/** 첫 렌더에서 보여줄 기본 월 (현재월이 이벤트 범위 내면 현재월, 아니면 첫 세그먼트=연습월). 클라와 동일 로직 */
function resolveDefaultMonth(startDt: string, endDt: string): string {
  const curMonth = currentMonthKST();
  const practiceMonth = prevMonthStr(startDt.slice(0, 7) + "-01");
  const endMonth = endDt.slice(0, 7) + "-01";
  // 현재월이 [연습월, 종료월] 범위 안이면 현재월, 아니면 연습월(첫 세그먼트)
  if (curMonth >= practiceMonth && curMonth <= endMonth) return curMonth;
  return practiceMonth;
}

export default async function ProjectRecordsPage() {
  const { user, member, supabase } = await getCurrentMember();
  if (!user || !member) redirect("/auth/login");

  const { teamId } = await getRequestTeamContext();

  // ACTIVE 이벤트 조회
  const { data: event } = await supabase
    .from("evt_team_mst")
    .select("evt_id, evt_nm, stt_dt, end_dt")
    .eq("team_id", teamId)
    .eq("stts_enm", "ACTIVE")
    .maybeSingle();

  if (!event) redirect("/projects");

  // 참여 여부 확인 (prt_id까지 받아 첫 달 기록 prefetch에 재사용 → 클라 중복 조회 제거)
  const { data: prt } = await supabase
    .from("evt_team_prt_rel")
    .select("prt_id, aprv_yn")
    .eq("evt_id", event.evt_id)
    .eq("mem_id", member.id)
    .eq("aprv_yn", true)
    .maybeSingle();

  if (!prt) redirect("/projects");

  // 첫 화면에 보여줄 달의 기록을 서버에서 미리 조회 → 클라 useEffect 깜빡임 제거.
  // (월 전환은 클라이언트에서 계속 조회하므로 SPA 전환 속도는 유지)
  const initialMonth = resolveDefaultMonth(event.stt_dt, event.end_dt);
  const initialRecords = await fetchActivityRecords(supabase, prt.prt_id, initialMonth);

  return (
    <Suspense fallback={<Skeleton className="mx-6 mt-4 h-96 rounded-2xl" />}>
      <RecordsClient
        evtId={event.evt_id}
        memId={member.id}
        prtId={prt.prt_id}
        evtStartDt={event.stt_dt}
        evtEndDt={event.end_dt}
        initialMonth={initialMonth}
        initialRecords={initialRecords}
      />
    </Suspense>
  );
}
