import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createClient } from "@/lib/supabase/server";

import { FeedbackForm } from "@/components/feedback/feedback-form";
import { getTeamCopy } from "@/lib/queries/team-copy";
import { FeedbackList, type FeedbackItem } from "@/components/feedback/feedback-list";

export const metadata = { title: "건의하기" };

export default async function ProfileFeedbackPage() {
  const { user, member } = await getCurrentMember();

  if (!user) redirect("/auth/login?next=/profile/feedback");
  if (!member) redirect("/onboarding?next=/profile/feedback");

  const [supabase, { teamId }] = await Promise.all([createClient(), getRequestTeamContext()]);
  // 건의 목록과 팀 문구(입력칸 안내의 크루 이름)를 함께 읽는다 — 하나가 끝나길 기다렸다 다른 걸 읽지 않게
  const [{ data }, copy] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("fdbk_mst")
      .select("fdbk_id, cont_txt, stts_enm, adm_note_txt, crt_at")
      // 이 팀에 낸 것만 — 두 팀 소속자의 건의가 섞이지 않게(RLS 는 본인 것만 보여 준다)
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .eq("vers", 0)
      .order("crt_at", { ascending: false })
      .limit(50),
    getTeamCopy(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: FeedbackItem[] = (data ?? []).map((row: any) => ({
    id: row.fdbk_id,
    body: row.cont_txt,
    status: row.stts_enm as FeedbackItem["status"],
    admin_note: row.adm_note_txt ?? null,
    created_at: row.crt_at,
  }));

  return (
    <div className="flex flex-col gap-7 px-6 pb-6 pt-4">
      <FeedbackForm crewName={copy.crewName} />
      <FeedbackList items={items} />
    </div>
  );
}
