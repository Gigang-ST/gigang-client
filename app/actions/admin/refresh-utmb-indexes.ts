"use server";

import { revalidateTag } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { fetchUtmbIndex } from "@/app/actions/utmb";

export type RefreshRow = {
  memId: string;
  name: string;
  before: number;
  after: number | null;
  status: "updated" | "unchanged" | "failed";
  error?: string;
};

export type RefreshResult = {
  rows: RefreshRow[];
  summary: { updated: number; unchanged: number; failed: number };
};

const REQUEST_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function refreshUtmbIndexes(): Promise<RefreshResult> {
  const me = await verifyAdmin();
  if (!me) throw new Error("권한이 없습니다");

  const { teamId } = await getRequestTeamContext();
  const admin = createAdminClient();

  // 1) 현재 팀 소속 회원 ID 조회
  const { data: teamMembers, error: teamErr } = await admin
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (teamErr) {
    console.error("[refreshUtmbIndexes] team query error:", teamErr);
    throw new Error("팀 회원 조회에 실패했습니다");
  }

  const memIds = (teamMembers ?? []).map((r) => r.mem_id);
  if (memIds.length === 0) {
    return { rows: [], summary: { updated: 0, unchanged: 0, failed: 0 } };
  }

  // 2) UTMB 프로필 + 이름 조회
  const { data: targets, error: fetchError } = await admin
    .from("mem_utmb_prf")
    .select("mem_id, utmb_prf_url, utmb_idx, mem_mst!inner(mem_nm)")
    .in("mem_id", memIds)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_mst.vers", 0)
    .eq("mem_mst.del_yn", false);

  if (fetchError) {
    console.error("[refreshUtmbIndexes] fetch error:", fetchError);
    throw new Error("회원 목록 조회에 실패했습니다");
  }

  const rows: RefreshRow[] = [];

  for (const t of targets ?? []) {
    const memId = t.mem_id;
    const name = (t.mem_mst as unknown as { mem_nm: string }).mem_nm ?? "";
    const before = t.utmb_idx;

    const result = await fetchUtmbIndex(t.utmb_prf_url);

    if (!result.ok) {
      rows.push({
        memId,
        name,
        before,
        after: null,
        status: "failed",
        error: result.error,
      });
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const after = result.index;

    if (after === before) {
      // 값 동일 — utmb_idx에 동일값을 다시 써서 BEFORE UPDATE 트리거(set_v2_upd_at)가
      // 마지막 시도 시각을 갱신하도록 한다.
      const { error: updErr } = await admin
        .from("mem_utmb_prf")
        .update({ utmb_idx: before })
        .eq("mem_id", memId)
        .eq("vers", 0);
      rows.push({
        memId,
        name,
        before,
        after,
        status: updErr ? "failed" : "unchanged",
        error: updErr?.message,
      });
    } else {
      const { error: updErr } = await admin
        .from("mem_utmb_prf")
        .update({
          utmb_idx: after,
          rct_race_nm: result.recentRaceName,
          rct_race_rec: result.recentRaceRecord,
        })
        .eq("mem_id", memId)
        .eq("vers", 0);
      rows.push({
        memId,
        name,
        before,
        after,
        status: updErr ? "failed" : "updated",
        error: updErr?.message,
      });
    }

    await sleep(REQUEST_DELAY_MS);
  }

  // 정렬: updated → failed → unchanged
  const order = { updated: 0, failed: 1, unchanged: 2 } as const;
  rows.sort((a, b) => order[a.status] - order[b.status]);

  const summary = rows.reduce(
    (acc, r) => {
      acc[r.status] += 1;
      return acc;
    },
    { updated: 0, unchanged: 0, failed: 0 },
  );

  if (summary.updated > 0) {
    revalidateTag(`records:${teamId}`, "max");
  }

  return { rows, summary };
}
