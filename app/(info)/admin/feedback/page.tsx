import { redirect } from "next/navigation";

import { verifyAdmin } from "@/lib/queries/member";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

import { H2 } from "@/components/common/typography";
import { FeedbackAdminList, type AdminFeedbackItem } from "@/components/feedback/feedback-admin-list";

export const metadata = { title: "의견함" };

export default async function AdminFeedbackPage() {
  const admin = await verifyAdmin();
  if (!admin) redirect("/admin");

  const db = createUntypedAdminClient();
  const { data } = await db
    .from("feedback_messages")
    .select("id, user_id, body, status, admin_note, responded_at, created_at, mem_mst!inner(mem_nm)")
    .eq("del_yn", false)
    .eq("vers", 0)
    .order("created_at", { ascending: false })
    .limit(100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: AdminFeedbackItem[] = (data ?? []).map((row: any) => {
    const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
    return {
      id: row.id,
      user_id: row.user_id,
      body: row.body,
      status: row.status as AdminFeedbackItem["status"],
      admin_note: row.admin_note ?? null,
      responded_at: row.responded_at ?? null,
      created_at: row.created_at,
      mem_nm: (mem as { mem_nm: string })?.mem_nm ?? row.user_id,
    };
  });

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
      <H2>의견함</H2>
      <FeedbackAdminList items={items} />
    </div>
  );
}
