import { redirect } from "next/navigation";

import { getKakaoSendLogs } from "@/app/actions/admin/kakao-send-log";
import { verifyAdmin } from "@/lib/queries/member";

import { AdminKakaoLogClient } from "./admin-kakao-log-client";

export const metadata = { title: "카카오 발송 이력" };

export default async function AdminKakaoLogPage() {
  const admin = await verifyAdmin();
  if (!admin) redirect("/admin");

  const { logs, tableMissing } = await getKakaoSendLogs();
  return <AdminKakaoLogClient logs={logs} tableMissing={tableMissing} />;
}
