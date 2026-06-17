import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/queries/member";
import { createClient } from "@/lib/supabase/server";

import { FeedbackForm } from "@/components/feedback/feedback-form";
import { FeedbackList, type FeedbackItem } from "@/components/feedback/feedback-list";

export const metadata = { title: "건의하기" };

export default async function ProfileFeedbackPage() {
  const { user, member } = await getCurrentMember();

  if (!user) redirect("/auth/login?next=/profile/feedback");
  if (!member) redirect("/onboarding?next=/profile/feedback");

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("fdbk_mst")
    .select("fdbk_id, cont_txt, stts_enm, adm_note_txt, crt_at")
    .eq("del_yn", false)
    .eq("vers", 0)
    .order("crt_at", { ascending: false })
    .limit(50);

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
      <FeedbackForm />
      <FeedbackList items={items} />
    </div>
  );
}
