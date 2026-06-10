import { redirect } from "next/navigation";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

import type { NotiTypeEnm } from "@/app/actions/admin/send-notification";

import { AdminNotificationsClient } from "./admin-notifications-client";

export const metadata = { title: "수동 알림 발송" };

const NOTI_TEMPLATES: Record<string, { notiNm: string; notiCont: string; notiTypeEnm: NotiTypeEnm }> = {
  dues_notice: {
    notiNm: "회비 안내",
    notiCont: "[프로필] - 회비내역을 확인해 주세요.",
    notiTypeEnm: "dues_notice",
  },
};

export type HistoryBatch = {
  batchId: string;
  notiTypeEnm: NotiTypeEnm;
  notiNm: string;
  notiCont: string | null;
  crtAt: string | null;
  recipients: { memId: string; memNm: string; readYn: boolean }[];
};

export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<{ memIds?: string; template?: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) redirect("/admin");

  const { memIds: memIdsParam, template } = await searchParams;
  const { teamId } = await getRequestTeamContext();
  const db = createAdminClient();

  const [membersRes, historyRes] = await Promise.all([
    db
      .from("team_mem_rel")
      .select("mem_id, mem_mst!inner(mem_nm)")
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("mem_id"),
    db
      .from("noti_mst")
      .select("batch_id, noti_type_enm, noti_nm, noti_cont, crt_at, mem_id, read_yn, mem_mst!inner(mem_nm)")
      .eq("team_id", teamId)
      .in("noti_type_enm", ["adm_cust", "dues_notice"])
      .not("batch_id", "is", null)
      .eq("del_yn", false)
      .order("crt_at", { ascending: false })
      .limit(500),
  ]);

  if (membersRes.error || historyRes.error) {
    throw new Error("알림 데이터를 불러오는 중 오류가 발생했습니다.");
  }

  const memberList = (membersRes.data ?? []).map((row) => {
    const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
    return {
      mem_id: row.mem_id,
      mem_nm: (mem as { mem_nm: string }).mem_nm,
    };
  });

  // batch_id로 그룹핑, 최대 20배치
  const batchMap = new Map<string, HistoryBatch>();
  for (const row of historyRes.data ?? []) {
    if (!row.batch_id) continue;
    if (!batchMap.has(row.batch_id)) {
      batchMap.set(row.batch_id, {
        batchId: row.batch_id,
        notiTypeEnm: (row.noti_type_enm as NotiTypeEnm) ?? "adm_cust",
        notiNm: row.noti_nm,
        notiCont: row.noti_cont ?? null,
        crtAt: row.crt_at,
        recipients: [],
      });
    }
    const memMst = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
    const memNm = (memMst as { mem_nm: string } | null)?.mem_nm ?? row.mem_id;
    batchMap.get(row.batch_id)!.recipients.push({ memId: row.mem_id, memNm, readYn: row.read_yn ?? false });
  }
  const history = Array.from(batchMap.values()).slice(0, 20);

  const initialSelectedIds = memIdsParam ? memIdsParam.split(",").filter(Boolean) : [];
  const tmpl = template ? (NOTI_TEMPLATES[template] ?? null) : null;

  return (
    <AdminNotificationsClient
      members={memberList}
      initialSelectedIds={initialSelectedIds}
      initialNotiNm={tmpl?.notiNm ?? ""}
      initialNotiCont={tmpl?.notiCont ?? ""}
      initialNotiTypeEnm={tmpl?.notiTypeEnm ?? "adm_cust"}
      history={history}
    />
  );
}
