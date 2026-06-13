import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/queries/member";
import { createClient } from "@/lib/supabase/server";

import { FeedbackForm } from "@/components/feedback/feedback-form";
import { FeedbackList, type FeedbackItem } from "@/components/feedback/feedback-list";

export const metadata = { title: "의견 보내기" };

export default async function ProfileFeedbackPage() {
  const { user, member } = await getCurrentMember();

  if (!user) redirect("/auth/login?next=/profile/feedback");
  if (!member) redirect("/onboarding?next=/profile/feedback");

  const supabase = await createClient();
  const { data } = await supabase
    .from("feedback_messages")
    .select("id, body, status, admin_note, created_at")
    .eq("del_yn", false)
    .eq("vers", 0)
    .order("created_at", { ascending: false })
    .limit(50);

  const items: FeedbackItem[] = (data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    status: row.status as FeedbackItem["status"],
    admin_note: row.admin_note ?? null,
    created_at: row.created_at,
  }));

  return (
    <div className="flex flex-col gap-7 px-6 pb-6 pt-4">
      <FeedbackForm />
      <FeedbackList items={items} />
    </div>
  );
}
