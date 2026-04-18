import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentMember } from "@/lib/queries/member";
import { createAdminClient } from "@/lib/supabase/admin";
import { RecordsClient } from "./records-client";

export default async function ProjectRecordsPage() {
  const { user, member } = await getCurrentMember();
  if (!user || !member) redirect("/auth/login");

  const db = createAdminClient();

  // ACTIVE 이벤트 조회
  const { data: event } = await db
    .from("evt_team_mst")
    .select("evt_id, evt_nm, stt_dt, end_dt")
    .eq("status_cd", "ACTIVE")
    .maybeSingle();

  if (!event) redirect("/projects");

  // 참여 여부 확인
  const { data: prt } = await db
    .from("evt_team_prt_rel")
    .select("approve_yn")
    .eq("evt_id", event.evt_id)
    .eq("mem_id", member.id)
    .eq("approve_yn", true)
    .maybeSingle();

  if (!prt) redirect("/projects");

  return (
    <Suspense fallback={<Skeleton className="mx-6 mt-4 h-96 rounded-2xl" />}>
      <RecordsClient
        evtId={event.evt_id}
        memId={member.id}
        evtStartDt={event.stt_dt}
        evtEndDt={event.end_dt}
      />
    </Suspense>
  );
}
