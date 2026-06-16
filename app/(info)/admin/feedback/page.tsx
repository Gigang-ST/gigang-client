import { redirect } from "next/navigation";

import { verifyAdmin } from "@/lib/queries/member";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

import { H2 } from "@/components/common/typography";
import { FeedbackAdminList, type AdminFeedbackItem } from "@/components/feedback/feedback-admin-list";

export const metadata = { title: "건의 내역" };

export default async function AdminFeedbackPage() {
  const admin = await verifyAdmin();
  if (!admin) redirect("/admin");

  const db = createUntypedAdminClient();
  const { data } = await db
    .from("fdbk_mst")
    .select("fdbk_id, mem_id, cont_txt, stts_enm, adm_note_txt, rspd_at, crt_at, mem_mst!inner(mem_nm)")
    .eq("del_yn", false)
    .eq("vers", 0)
    .order("crt_at", { ascending: false })
    .limit(100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: AdminFeedbackItem[] = (data ?? []).map((row: any) => {
    const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
    return {
      id: row.fdbk_id,
      user_id: row.mem_id,
      body: row.cont_txt,
      status: row.stts_enm as AdminFeedbackItem["status"],
      admin_note: row.adm_note_txt ?? null,
      responded_at: row.rspd_at ?? null,
      created_at: row.crt_at,
      mem_nm: (mem as { mem_nm: string })?.mem_nm ?? row.mem_id,
    };
  });

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
      <H2>건의 내역</H2>
      <FeedbackAdminList items={items} />
    </div>
  );
}
