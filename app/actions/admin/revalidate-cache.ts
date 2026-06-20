"use server";

import { revalidateTag } from "next/cache";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export async function revalidateRecordsCache(): Promise<{ ok: boolean; message: string }> {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    revalidateTag("records", "max");
    revalidateTag(`records:${teamId}`, "max");
    return { ok: true, message: "랭킹 캐시가 초기화됐습니다." };
  });
}
