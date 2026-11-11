"use server";

import { revalidateTag } from "next/cache";

import { withAdmin } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";

export async function revalidateRecordsCache(): Promise<{ ok: boolean; message: string }> {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    // 이 팀 전당만 — 공용 "records" 를 털면 모든 팀 전당·피드·오버뷰가 같이 비워진다
    revalidateTag(`records:${teamId}`, "max");
    return { ok: true, message: "랭킹 캐시가 초기화됐습니다." };
  });
}
