"use server";

import { revalidateTag } from "next/cache";

import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export async function revalidateRecordsCache(): Promise<{ ok: boolean; message: string }> {
  const admin = await verifyAdmin();
  if (!admin) return { ok: false, message: "권한이 없습니다." };

  const { teamId } = await getRequestTeamContext();
  revalidateTag("records", "max");
  revalidateTag(`records:${teamId}`, "max");

  return { ok: true, message: "랭킹 캐시가 초기화됐습니다." };
}
