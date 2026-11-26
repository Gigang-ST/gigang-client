import { syncIntervalsForMember } from "@/lib/intervals/core";
import { getIntervalsSecret } from "@/lib/intervals/server";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

import type { BatchContext, BatchResult } from "@/lib/batch/types";

/** 한 번에 외부(intervals.icu)로 나가는 요청 수 — 느슨하게 3개씩. */
const CONCURRENCY = 3;

/**
 * intervals.icu 활동 동기화 일 배치(#760) — 연결한 회원의 활동 요약을 최근 60일 범위로 다시 받는다.
 *
 * ⚠️ 이 파일은 `"use server"` 가 아니다(서버 액션으로 노출되면 임의 `teamId` 로 부를 수 있다).
 * 한 회원의 실패(키 거부·네트워크)가 배치를 멈추지 않는다 — 센 뒤 지표에 남긴다.
 * 키 거부(`auth_failed`)는 회원의 연결 상태에 기록돼 프로필에서 「다시 연결」로 보인다.
 */
export async function batchIntervalsSync(ctx: BatchContext): Promise<BatchResult> {
  const secret = getIntervalsSecret();
  if (!secret) {
    throw new Error("INTERVALS_KEY_SECRET 이 설정되지 않아 동기화할 수 없습니다.");
  }
  const db = createUntypedAdminClient();

  const { data: conns, error } = await db
    .from("mem_icu_cnn_rel")
    .select("mem_id")
    .eq("team_id", ctx.teamId)
    .order("mem_id", { ascending: true });
  if (error) throw new Error(`연결 목록 조회 실패: ${error.message}`);
  const memIds = ((conns ?? []) as { mem_id: string }[]).map((c) => c.mem_id);

  let okCnt = 0;
  let failCnt = 0;
  let added = 0;
  const warnings: string[] = [];

  for (let i = 0; i < memIds.length; i += CONCURRENCY) {
    const results = await Promise.all(
      memIds.slice(i, i + CONCURRENCY).map((memId) => syncIntervalsForMember(db, { memId, secret })),
    );
    for (const r of results) {
      if (r.ok) {
        okCnt += 1;
        added += r.added;
      } else {
        failCnt += 1;
      }
    }
  }
  if (failCnt > 0) warnings.push(`${failCnt}명은 가져오지 못했습니다(키 거부·일시 오류 — 회원 연결 상태에 기록됨).`);

  return {
    msg: `연결 ${memIds.length}명 중 ${okCnt}명 동기화, 새 활동 ${added}건`,
    metrics: [
      { label: "연결", value: memIds.length },
      { label: "성공", value: okCnt },
      { label: "실패", value: failCnt },
      { label: "새 활동", value: added },
    ],
    changedCount: added,
    changes: null,
    warnings: warnings.length ? warnings : null,
  };
}
